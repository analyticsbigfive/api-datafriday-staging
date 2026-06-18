-- Migration: add performer, openingAct, sponsor to get_space_shop_details events array
-- These fields were missing from the metadata projection even though the PATCH endpoint
-- already stores them in WeezeventEvent.metadata.

CREATE OR REPLACE FUNCTION get_space_shop_details(
  p_space_id        text,
  p_tenant_id       text,
  p_page            int     DEFAULT 1,
  p_limit           int     DEFAULT 20,
  p_include_granular boolean DEFAULT false
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
  v_location_ids      text[];
  v_eff_limit         int;
  v_offset            int;
  v_total_events      bigint;
  v_paginated_ids     text[];

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
  WHERE c."spaceId" = p_space_id;

  IF v_config_ids IS NULL OR array_length(v_config_ids, 1) = 0 THEN
    RETURN jsonb_build_object(
      'shops', '[]'::jsonb,
      'shopGranularData', '[]'::jsonb,
      'events', '[]'::jsonb,
      'menuItemCostMap', '{}'::jsonb,
      'meta', jsonb_build_object('page', p_page, 'limit', p_limit, 'total', 0, 'totalPages', 0)
    );
  END IF;

  -- ── RTT B: shop element IDs ───────────────────────────────────────────────
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

  v_shop_ids_param := COALESCE(v_shop_ids, ARRAY['__no_shops__'::text]);

  v_eff_limit := GREATEST(1, LEAST(200, p_limit));
  v_offset    := GREATEST(0, (p_page - 1) * p_limit);

  -- ── KEY OPTIMISATION: resolve locationIds once ───────────────────────────
  SELECT ARRAY_AGG(DISTINCT "weezeventLocationId") INTO v_location_ids
  FROM "WeezeventLocationShopMapping"
  WHERE "tenantId" = p_tenant_id
    AND "spaceElementId" = ANY(v_shop_ids_param);

  IF v_location_ids IS NULL OR array_length(v_location_ids, 1) = 0 THEN
    v_total_events  := 0;
    v_paginated_ids := ARRAY[]::text[];
    v_granular_json := '[]'::jsonb;
    v_events_json   := '[]'::jsonb;
    v_cost_map_json := '{}'::jsonb;
  ELSE
    -- ── RTT E: paginated WeezeventEvent IDs ─────────────────────────────────
    CREATE TEMP TABLE _space_event_ids ON COMMIT DROP AS
      SELECT DISTINCT we.id, we."startDate"
      FROM "WeezeventTransaction" t
      INNER JOIN "WeezeventEvent" we
        ON we.id = t."eventId"
       AND we."tenantId" = p_tenant_id
      WHERE t."tenantId" = p_tenant_id
        AND t.status    = 'V'
        AND t."locationId" = ANY(v_location_ids);

    SELECT COUNT(*) INTO v_total_events FROM _space_event_ids;

    SELECT ARRAY_AGG(id ORDER BY "startDate" DESC NULLS LAST) INTO v_paginated_ids
    FROM (
      SELECT id, "startDate"
      FROM _space_event_ids
      ORDER BY "startDate" DESC NULLS LAST
      LIMIT v_eff_limit OFFSET v_offset
    ) sub;

    -- ── RTT F: granular per-event × shop ─────────────────────────────────────
    IF p_include_granular AND v_paginated_ids IS NOT NULL AND array_length(v_paginated_ids, 1) > 0 THEN
      SELECT jsonb_agg(
        jsonb_build_object(
          'elementId',        g."elementId",
          'eventId',          COALESCE(g."datafridayEventId", g."weezeventEventId"),
          'datafridayEventId',COALESCE(g."datafridayEventId", g."weezeventEventId"),
          'weezeventEventId', g."weezeventEventId",
          'eventName',        g."eventName",
          'eventDate',        g."eventDate",
          'shopId',           g."shopId",
          'shopName',         g."shopName",
          'shopType',         g."shopType",
          'shopArea',         g."shopArea",
          'menuItemId',       NULL,
          'menuItemName',     NULL,
          'menuItemPicture',  NULL,
          'menuItemType',     NULL,
          'menuItemCategory', NULL,
          'weezpayCategory',  NULL,
          'weezpayNature',    NULL,
          'weezpaySubnature', NULL,
          'itemCost',         NULL,
          'revenueHt',        g."revenueHt",
          'revenue',          g."revenueHt",
          'quantity',         g."itemsCount",
          'transactionCount', g."transactionsCount"
        )
      ) INTO v_granular_json
      FROM (
        SELECT
          (COALESCE(lsm."spaceElementId", srma."weezeventLocationId") || '_' || srma."weezeventEventId") AS "elementId",
          srma."weezeventEventId"                                              AS "weezeventEventId",
          ev_df.id                                                             AS "datafridayEventId",
          COALESCE(ev_df.name, we.name, srma."weezeventEventId")              AS "eventName",
          COALESCE(ev_df."eventDate", we."startDate")                         AS "eventDate",
          COALESCE(lsm."spaceElementId", srma."weezeventLocationId")          AS "shopId",
          se.name                                                              AS "shopName",
          COALESCE(se.attributes::jsonb->>'originalType', se.type::text)      AS "shopType",
          se.attributes::jsonb->>'area'                                        AS "shopArea",
          SUM(srma."revenueHt")::numeric(12,2)                                AS "revenueHt",
          SUM(srma."itemsCount")::integer                                      AS "itemsCount",
          SUM(srma."transactionsCount")::integer                              AS "transactionsCount"
        FROM "SpaceRevenueMinuteAgg" srma
        LEFT JOIN "WeezeventLocationShopMapping" lsm
          ON lsm."weezeventLocationId" = srma."weezeventLocationId"
         AND lsm."tenantId"            = p_tenant_id
        LEFT JOIN "SpaceElement" se
          ON se.id = lsm."spaceElementId"
        LEFT JOIN "WeezeventEvent" we
          ON we.id = srma."weezeventEventId"
         AND we."tenantId" = p_tenant_id
        LEFT JOIN "Event" ev_df
          ON DATE(ev_df."eventDate") = DATE(COALESCE(we."startDate", srma.minute))
         AND ev_df."tenantId" = p_tenant_id
         AND ev_df."spaceId"  = p_space_id
        WHERE srma."tenantId"             = p_tenant_id
          AND srma."spaceId"              = p_space_id
          AND srma."weezeventLocationId"  = ANY(v_location_ids)
        GROUP BY
          lsm."spaceElementId", srma."weezeventEventId", srma."weezeventLocationId",
          ev_df.id, ev_df.name, ev_df."eventDate",
          we.id, we.name, we."startDate",
          se.name, se.type, se.attributes
      ) g;
    ELSE
      v_granular_json := '[]'::jsonb;
    END IF;

    -- ── RTT G+H: events with attendance — includes all metadata fields ────────
    SELECT jsonb_agg(
      jsonb_build_object(
        'id',              COALESCE(ev_df.id, ev.id),
        'weezeventEventId',ev.id,
        'name',            COALESCE(ev_df.name, ev.name, ev.id),
        'eventName',       COALESCE(ev_df.name, ev.name, ev.id),
        'date',            COALESCE(ev_df."eventDate", ev."startDate"),
        'ticketsScanned',  COALESCE(att."attendeeCount", 0),
        'attendees',       COALESCE(att."attendeeCount", 0),
        'isFuture',        (ev."startDate" IS NOT NULL AND ev."startDate" > NOW()),
        'doorsOpening',    ev.metadata::jsonb->>'doorsOpening',
        'showTime',        ev.metadata::jsonb->>'showTime',
        'category',        COALESCE(ev.metadata::jsonb->>'category', ev_df_cat.name),
        'eventType',       COALESCE(ev.metadata::jsonb->>'eventType', ev_df_type.name),
        'team',            ev.metadata::jsonb->>'team',
        'visitingTeam',    ev.metadata::jsonb->>'visitingTeam',
        'hasIntermission', (ev.metadata::jsonb->>'hasIntermission')::boolean,
        'performer',       ev.metadata::jsonb->>'performer',
        'openingAct',      ev.metadata::jsonb->>'openingAct',
        'sponsor',         ev.metadata::jsonb->>'sponsor'
      ) ORDER BY COALESCE(ev_df."eventDate", ev."startDate") DESC NULLS LAST
    ) INTO v_events_json
    FROM "WeezeventEvent" ev
    LEFT JOIN (
      SELECT "eventId", COUNT(id)::int AS "attendeeCount"
      FROM "WeezeventAttendee"
      WHERE "tenantId" = p_tenant_id
        AND "eventId"  = ANY(v_paginated_ids)
      GROUP BY "eventId"
    ) att ON att."eventId" = ev.id
    LEFT JOIN "Event" ev_df
      ON DATE(ev_df."eventDate") = DATE(ev."startDate")
     AND ev_df."tenantId"  = p_tenant_id
     AND ev_df."spaceId"   = p_space_id
    LEFT JOIN "EventCategory" ev_df_cat   ON ev_df_cat.id  = ev_df."eventCategoryId"
    LEFT JOIN "EventType"     ev_df_type  ON ev_df_type.id = ev_df."eventTypeId"
    WHERE ev.id         = ANY(v_paginated_ids)
      AND ev."tenantId" = p_tenant_id;

    -- ── Build menuItemCostMap ───────────────────────────────────────────────
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
        WHERE t."tenantId"   = p_tenant_id
          AND t.status       = 'V'
          AND t."locationId" = ANY(v_location_ids)
          AND t."eventId"    = ANY(v_paginated_ids)
      )
        AND mi."totalCost" IS NOT NULL
      GROUP BY 1
    ) cost_data
    WHERE key IS NOT NULL;

  END IF;

  -- ── Build shops list ───────────────────────────────────────────────────────
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
  LEFT JOIN "Floor" f      ON f.id  = se."floorId"      AND f."configId"  = ANY(v_config_ids)
  LEFT JOIN "Forecourt" fc ON fc.id = se."forecourtId"  AND fc."configId" = ANY(v_config_ids)
  INNER JOIN "Config" c
    ON c.id = COALESCE(f."configId", fc."configId")
  LEFT JOIN (
    SELECT "spaceElementId",
           SUM("revenueHt")         AS "revenueHt",
           SUM("transactionsCount") AS "transactionsCount",
           SUM("itemsCount")        AS "itemsCount"
    FROM "SpaceRevenueMinuteAgg"
    WHERE "tenantId"        = p_tenant_id
      AND "spaceId"         = p_space_id
      AND "spaceElementId"  = ANY(v_shop_ids_param)
    GROUP BY "spaceElementId"
  ) rev ON rev."spaceElementId" = se.id
  LEFT JOIN (
    SELECT DISTINCT ON ("spaceElementId") "spaceElementId", "weezeventLocationId"
    FROM "WeezeventLocationShopMapping"
    WHERE "tenantId"       = p_tenant_id
      AND "spaceElementId" = ANY(v_shop_ids_param)
  ) wm ON wm."spaceElementId" = se.id
  WHERE se.id = ANY(v_shop_ids_param);

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

GRANT EXECUTE ON FUNCTION get_space_shop_details(text, text, int, int, boolean)
  TO authenticated, service_role, anon;
