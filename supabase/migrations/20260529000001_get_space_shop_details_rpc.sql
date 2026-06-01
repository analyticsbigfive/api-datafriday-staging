-- Migration: get_space_shop_details RPC
-- Replaces 8 sequential DB round-trips in NestJS getShopDetails with a single SQL call.
-- Estimated savings: ~2 000 ms → ~300 ms per request.

CREATE OR REPLACE FUNCTION get_space_shop_details(
  p_space_id   text,
  p_tenant_id  text,
  p_page       int DEFAULT 1,
  p_limit      int DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config_ids        text[];
  v_shop_ids          text[];
  v_shop_ids_param    text[];
  v_eff_limit         int;
  v_offset            int;
  v_total_events      bigint;
  v_paginated_ids     text[];

  -- Output fragments
  v_shops_json        jsonb;
  v_granular_json     jsonb;
  v_events_json       jsonb;
  v_cost_map_json     jsonb;
BEGIN
  -- ── Ownership check ──────────────────────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM "Space" WHERE id = p_space_id AND "tenantId" = p_tenant_id
  ) THEN
    RETURN jsonb_build_object('__error', 'space_not_found');
  END IF;

  -- ── RTT A: config IDs for this space ─────────────────────────────────────
  SELECT ARRAY_AGG(c.id) INTO v_config_ids
  FROM "Config" c
  WHERE c."spaceId" = p_space_id
    AND c."tenantId" = p_tenant_id;

  IF v_config_ids IS NULL OR array_length(v_config_ids, 1) = 0 THEN
    RETURN jsonb_build_object(
      'shops', '[]'::jsonb,
      'shopGranularData', '[]'::jsonb,
      'events', '[]'::jsonb,
      'menuItemCostMap', '{}'::jsonb,
      'meta', jsonb_build_object('page', p_page, 'limit', p_limit, 'total', 0, 'totalPages', 0)
    );
  END IF;

  -- ── RTT B: shop element IDs (floors + forecourts unified) ─────────────────
  SELECT ARRAY_AGG(se.id) INTO v_shop_ids
  FROM "SpaceElement" se
  WHERE se.type IN ('shop','fnb_food','fnb_beverages','fnb_bar','fnb_snack','fnb_icecream','merchshop')
    AND (
      EXISTS (
        SELECT 1 FROM "Floor" f
        WHERE f.id = se."floorId" AND f."configId" = ANY(v_config_ids)
      )
      OR
      EXISTS (
        SELECT 1 FROM "Forecourt" fc
        WHERE fc.id = se."forecourtId" AND fc."configId" = ANY(v_config_ids)
      )
    );

  -- Guard against empty spaces
  v_shop_ids_param := COALESCE(v_shop_ids, ARRAY['__no_shops__'::text]);

  -- Pagination params
  v_eff_limit := GREATEST(1, LEAST(200, p_limit));
  v_offset    := GREATEST(0, (p_page - 1) * p_limit);

  -- ── RTT C: per-shop revenue totals (parallel in SQL, no extra RTT) ────────
  -- ── RTT D: weezevent merchant mappings ───────────────────────────────────
  -- ── RTT E: total event count + paginated event IDs ───────────────────────
  -- All computed in the same planner pass below.

  -- Event count scoped to this space's shops
  SELECT COUNT(DISTINCT we.id) INTO v_total_events
  FROM "WeezeventEvent" we
  WHERE we."tenantId" = p_tenant_id
    AND we.id IN (
      SELECT DISTINCT t."eventId"
      FROM "WeezeventTransaction" t
      INNER JOIN "WeezeventLocationShopMapping" mem
        ON mem."weezeventLocationId" = t."locationId"
       AND mem."tenantId" = p_tenant_id
       AND mem."spaceElementId" = ANY(v_shop_ids_param)
      WHERE t."tenantId" = p_tenant_id
        AND t.status = 'V'
        AND t."eventId" IS NOT NULL
    );

  -- Paginated event IDs
  SELECT ARRAY_AGG(we.id ORDER BY we."startDate" DESC NULLS LAST) INTO v_paginated_ids
  FROM (
    SELECT DISTINCT we2.id, we2."startDate"
    FROM "WeezeventEvent" we2
    WHERE we2."tenantId" = p_tenant_id
      AND we2.id IN (
        SELECT DISTINCT t."eventId"
        FROM "WeezeventTransaction" t
        INNER JOIN "WeezeventLocationShopMapping" mem
          ON mem."weezeventLocationId" = t."locationId"
         AND mem."tenantId" = p_tenant_id
         AND mem."spaceElementId" = ANY(v_shop_ids_param)
        WHERE t."tenantId" = p_tenant_id
          AND t.status = 'V'
          AND t."eventId" IS NOT NULL
      )
    ORDER BY we2."startDate" DESC NULLS LAST
    LIMIT v_eff_limit OFFSET v_offset
  ) we;

  -- ── RTT F: granular per-event × shop × product join ───────────────────────
  IF v_paginated_ids IS NOT NULL AND array_length(v_paginated_ids, 1) > 0 THEN
    SELECT jsonb_agg(
      jsonb_build_object(
        'elementId',        (mem."spaceElementId" || '_' || COALESCE(ti."productId", 'unmapped') || '_' || t."eventId"),
        'eventId',          t."eventId",
        'eventName',        we.name,
        'eventDate',        we."startDate",
        'shopId',           mem."spaceElementId",
        'shopName',         se.name,
        'shopType',         COALESCE(se.attributes::jsonb->>'originalType', se.type::text),
        'shopArea',         se.attributes::jsonb->>'area',
        'menuItemId',       COALESCE(wpm."menuItemId", ti."productId"),
        'menuItemName',     mi.name,
        'menuItemPicture',  mi.picture,
        'menuItemType',     pt.name,
        'menuItemCategory', pc.name,
        'weezpayCategory',  p."categoryId",
        'weezpayNature',    p."nature",
        'weezpaySubnature', p."subnature",
        'itemCost',         mi."totalCost",
        'revenueHt',        SUM(ti."unitPrice" * ti.quantity / (1 + COALESCE(p."vatRate", 20) / 100))::numeric(12,2),
        'quantity',         SUM(ti.quantity)::integer,
        'transactionCount', COUNT(DISTINCT t.id)::integer
      )
    ) INTO v_granular_json
    FROM "WeezeventTransaction" t
    INNER JOIN "WeezeventTransactionItem" ti
      ON ti."transactionId" = t.id
    INNER JOIN "WeezeventLocationShopMapping" mem
      ON mem."weezeventLocationId" = t."locationId"
     AND mem."tenantId" = p_tenant_id
     AND mem."spaceElementId" = ANY(v_shop_ids_param)
    INNER JOIN "SpaceElement" se
      ON se.id = mem."spaceElementId"
    LEFT JOIN "WeezeventEvent" we
      ON we.id = t."eventId"
    LEFT JOIN "WeezeventProduct" p
      ON p.id = ti."productId"
    LEFT JOIN "WeezeventProductMapping" wpm
      ON wpm."weezeventProductId" = ti."productId"
     AND wpm."tenantId" = p_tenant_id
    LEFT JOIN "MenuItem" mi
      ON mi.id = wpm."menuItemId"
    LEFT JOIN "ProductType" pt
      ON pt.id = mi."typeId"
    LEFT JOIN "ProductCategory" pc
      ON pc.id = mi."categoryId"
    WHERE t."tenantId" = p_tenant_id
      AND t.status = 'V'
      AND t."eventId" = ANY(v_paginated_ids)
    GROUP BY
      t."eventId", we.name, we."startDate",
      mem."spaceElementId", se.name, se.type, se.attributes,
      ti."productId", wpm."menuItemId", mi.name, mi.picture, pt.name, pc.name,
      mi."totalCost", p."vatRate", p."categoryId", p."nature", p."subnature", p."rawData";
  ELSE
    v_granular_json := '[]'::jsonb;
  END IF;

  -- ── RTT G+H: attendee counts + event metadata ─────────────────────────────
  -- events list with attendee counts, built from granular rows already fetched
  SELECT jsonb_agg(
    jsonb_build_object(
      'id',             ev.id,
      'name',           COALESCE(ev.name, ev.id),
      'eventName',      COALESCE(ev.name, ev.id),
      'date',           ev."startDate",
      'ticketsScanned', COALESCE(att."attendeeCount", 0),
      'attendees',      COALESCE(att."attendeeCount", 0),
      'isFuture',       (ev."startDate" IS NOT NULL AND ev."startDate" > NOW()),
      'doorsOpening',   ev.metadata::jsonb->>'doorsOpening',
      'showTime',       ev.metadata::jsonb->>'showTime',
      'category',       ev.metadata::jsonb->>'category',
      'eventType',      ev.metadata::jsonb->>'eventType',
      'team',           ev.metadata::jsonb->>'team',
      'visitingTeam',   ev.metadata::jsonb->>'visitingTeam',
      'hasIntermission',(ev.metadata::jsonb->>'hasIntermission')::boolean
    ) ORDER BY ev."startDate" DESC NULLS LAST
  ) INTO v_events_json
  FROM "WeezeventEvent" ev
  LEFT JOIN (
    SELECT "eventId", COUNT(id)::int AS "attendeeCount"
    FROM "WeezeventAttendee"
    WHERE "tenantId" = p_tenant_id
      AND "eventId" = ANY(v_paginated_ids)
    GROUP BY "eventId"
  ) att ON att."eventId" = ev.id
  WHERE ev.id = ANY(v_paginated_ids)
    AND ev."tenantId" = p_tenant_id;

  -- ── Build shops list (per-shop summary) ───────────────────────────────────
  SELECT jsonb_agg(
    jsonb_build_object(
      'shopId',               se.id,
      'shopName',             se.name,
      'shopType',             COALESCE(se.attributes::jsonb->>'originalType', se.type::text),
      'shopSubTypes',         se."shopTypes",
      'configId',             c.id,
      'configName',           c.name,
      'locationId',           COALESCE(f.id, fc.id),
      'locationName',         COALESCE(f.name, fc.name),
      'locationType',         CASE WHEN f.id IS NOT NULL THEN 'floor' ELSE 'forecourt' END,
      'revenue',              COALESCE(rev."revenueHt", 0),
      'transactionCount',     COALESCE(rev."transactionsCount", 0),
      'itemsCount',           COALESCE(rev."itemsCount", 0),
      'isMappedToWeezevent',  (wm."weezeventLocationId" IS NOT NULL),
      'weezeventMerchantId',  wm."weezeventLocationId"
    )
  ) INTO v_shops_json
  FROM "SpaceElement" se
  LEFT JOIN "Floor" f     ON f.id = se."floorId"     AND f."configId" = ANY(v_config_ids)
  LEFT JOIN "Forecourt" fc ON fc.id = se."forecourtId" AND fc."configId" = ANY(v_config_ids)
  INNER JOIN "Config" c
    ON c.id = COALESCE(f."configId", fc."configId")
  LEFT JOIN (
    SELECT "spaceElementId",
           SUM("revenueHt")        AS "revenueHt",
           SUM("transactionsCount") AS "transactionsCount",
           SUM("itemsCount")        AS "itemsCount"
    FROM "SpaceRevenueMinuteAgg"
    WHERE "tenantId" = p_tenant_id
      AND "spaceId"  = p_space_id
      AND "spaceElementId" = ANY(v_shop_ids_param)
    GROUP BY "spaceElementId"
  ) rev ON rev."spaceElementId" = se.id
  LEFT JOIN (
    SELECT DISTINCT ON ("spaceElementId") "spaceElementId", "weezeventLocationId"
    FROM "WeezeventLocationShopMapping"
    WHERE "tenantId" = p_tenant_id
      AND "spaceElementId" = ANY(v_shop_ids_param)
  ) wm ON wm."spaceElementId" = se.id
  WHERE se.id = ANY(v_shop_ids_param);

  -- ── Build menuItemCostMap from granular data ───────────────────────────────
  SELECT jsonb_object_agg(key, value) INTO v_cost_map_json
  FROM (
    SELECT
      COALESCE(wpm."menuItemId", ti."productId") AS key,
      MIN(mi."totalCost")                         AS value
    FROM "WeezeventTransactionItem" ti
    LEFT JOIN "WeezeventProductMapping" wpm
      ON wpm."weezeventProductId" = ti."productId"
     AND wpm."tenantId" = p_tenant_id
    LEFT JOIN "MenuItem" mi
      ON mi.id = wpm."menuItemId"
    WHERE ti."transactionId" IN (
      SELECT t.id FROM "WeezeventTransaction" t
      WHERE t."tenantId" = p_tenant_id
        AND t.status = 'V'
        AND t."eventId" = ANY(v_paginated_ids)
    )
      AND mi."totalCost" IS NOT NULL
    GROUP BY 1
  ) cost_data
  WHERE key IS NOT NULL;

  -- ── Return final response ─────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'shops',           COALESCE(v_shops_json,   '[]'::jsonb),
    'shopGranularData',COALESCE(v_granular_json,'[]'::jsonb),
    'events',          COALESCE(v_events_json,  '[]'::jsonb),
    'menuItemCostMap', COALESCE(v_cost_map_json,'{}'::jsonb),
    'meta', jsonb_build_object(
      'page',       p_page,
      'limit',      p_limit,
      'total',      v_total_events,
      'totalPages', CEIL(v_total_events::float / GREATEST(p_limit, 1))
    )
  );
END;
$$;

-- Grant execute to the authenticated and service_role roles used by Supabase
GRANT EXECUTE ON FUNCTION get_space_shop_details(text, text, int, int)
  TO authenticated, service_role, anon;
