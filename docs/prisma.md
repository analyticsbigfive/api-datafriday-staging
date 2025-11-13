// Prisma schema for DataFriday SaaS (Postgres / Supabase)
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum RoleName {
  ADMIN
  ORG_ADMIN
  MANAGER
  FNB_MANAGER
  HOSPITALITY_MANAGER
  LOGISTICS_MANAGER
  STAFF
  ANALYST
  VIEWER
}

enum UserStatus {
  ACTIVE
  SUSPENDED
  PENDING
}

enum SpaceType {
  ARENA
  STADIUM
  HALL
  OPEN_SPACE
  VIP_LODGE
}

enum PosType {
  FNB
  MERCH
  TICKETING
  VIP
  HOSPITALITY
}

enum StorageType {
  COLD
  DRY
  GENERAL
}

enum MovementType {
  IN
  OUT
  ADJUSTMENT
}

enum EventStatus {
  DRAFT
  SCHEDULED
  LIVE
  CLOSED
}

enum SubscriptionPlanKey {
  FREE
  PRO
  ENTERPRISE
  CUSTOM
}

enum SubscriptionStatus {
  ACTIVE
  TRIAL
  EXPIRED
  CANCELED
}

enum PaymentMethod {
  CASH
  CARD
  MOBILE
  OTHER
}

enum IntegrationTypeEnum {
  POS_PUBLIC
  POS_VIP
  TICKETING
  RESERVATION
  MERCH
  HR
  PURCHASING
  FORECAST
}

enum AlertType {
  LOW_STOCK
  OUT_OF_STOCK
  EXPIRED
}

enum AlertLevel {
  INFO
  WARNING
  CRITICAL
}

enum AlertStatus {
  OPEN
  RESOLVED
}

model User {
  id                 String       @id @default(uuid())
  organisationId     String?      @db.Uuid
  organisation       Organisation? @relation(fields: [organisationId], references: [id])
  name               String
  email              String       @unique
  phone              String?
  avatarUrl          String?
  twoFactorSecret    String?      // TOTP secret (encrypted at rest)
  twoFactorEnabled   Boolean      @default(false)
  lastLogin          DateTime?
  status             UserStatus   @default(ACTIVE)
  createdAt          DateTime     @default(now())
  updatedAt          DateTime     @updatedAt

  // Relations
  userRoles          UserRole[]
  sessions           Session[]
  spaceUsers         SpaceUser[]
  auditLogs          AuditLog[]   @relation("user_audit")
  eventStaffs        EventStaff[]
  notifications      Notification[]
  purchaseOrders     PurchaseOrder[] @relation("purchase_by_user")
}

model Role {
  id          String   @id @default(uuid())
  name        RoleName
  description String?
  isSystem    Boolean  @default(true)
  createdAt   DateTime @default(now())

  rolePermissions RolePermission[]
  userRoles       UserRole[]
}

model Permission {
  id          String   @id @default(uuid())
  key         String   @unique
  description String?
  createdAt   DateTime @default(now())

  rolePermissions RolePermission[]
}

model RolePermission {
  id           String     @id @default(uuid())
  roleId       String
  permissionId String
  role         Role       @relation(fields: [roleId], references: [id])
  permission   Permission @relation(fields: [permissionId], references: [id])

  @@unique([roleId, permissionId])
}

model UserRole {
  id             String   @id @default(uuid())
  userId         String
  roleId         String
  organisationId String?  @db.Uuid

  user     User @relation(fields: [userId], references: [id])
  role     Role @relation(fields: [roleId], references: [id])

  @@unique([userId, roleId, organisationId])
}

model Session {
  id         String   @id @default(uuid())
  userId     String
  ipAddress  String?
  userAgent  String?
  deviceName String?
  token      String
  validUntil DateTime
  createdAt  DateTime @default(now())

  user User @relation(fields: [userId], references: [id])
}

model Organisation {
  id            String   @id @default(uuid())
  name          String
  slug          String   @unique
  ownerId       String?  @db.Uuid
  owner         User?    @relation(fields: [ownerId], references: [id])
  logoUrl       String?
  timezone      String   @default("UTC")
  currency      String   @default("EUR")
  address       Json?
  billingEmail  String?
  planId        String?  @db.Uuid
  active        Boolean  @default(true)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  users         User[]
  spaces        Space[]
  subscriptions Subscription[]
  invoices      Invoice[]
  settings      Setting[]
  suppliers     Supplier[]
}

model SubscriptionPlan {
  id            String   @id @default(uuid())
  key           SubscriptionPlanKey @unique
  name          String
  pricePerMonth Decimal  @db.Decimal(12, 2) @default("0.00")
  maxUsers      Int?
  maxSpaces     Int?
  maxIntegrations Int?
  features      Json?
  description   String?
  createdAt     DateTime @default(now())
}

model Subscription {
  id             String   @id @default(uuid())
  organisationId String
  planId         String
  startDate      DateTime
  endDate        DateTime?
  renewalDate    DateTime?
  status         SubscriptionStatus @default(ACTIVE)
  paymentProvider String?
  externalId     String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  organisation Organisation @relation(fields: [organisationId], references: [id])
  plan         SubscriptionPlan @relation(fields: [planId], references: [id])
  invoices     Invoice[]
}

model Invoice {
  id             String   @id @default(uuid())
  organisationId String
  subscriptionId String?
  total          Decimal  @db.Decimal(12,2)
  currency       String
  issueDate      DateTime
  dueDate        DateTime?
  paidAt         DateTime?
  status         String
  pdfUrl         String?
  createdAt      DateTime @default(now())

  organisation  Organisation @relation(fields: [organisationId], references: [id])
  subscription  Subscription? @relation(fields: [subscriptionId], references: [id])
}

model Space {
  id            String   @id @default(uuid())
  organisationId String  @db.Uuid
  name          String
  type          SpaceType
  address       String?
  gpsCoordinates Json?
  floors        Int? 
  undergrounds  Int?
  totalSurface  Decimal?  @db.Decimal(10,2)
  createdById   String?   @db.Uuid
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  organisation  Organisation @relation(fields: [organisationId], references: [id])
  createdBy     User?       @relation(fields: [createdById], references: [id])
  pos           POS[]
  storages      Storage[]
  vipAreas      VIPArea[]
  events        Event[]
  zones         SpaceZone[]
  entrances     SpaceEntrance[]
  spaceUsers    SpaceUser[]
  financialReports FinancialReport[]
}

model SpaceZone {
  id          String   @id @default(uuid())
  spaceId     String
  name        String
  type        String
  capacity    Int?
  coordinates Json?

  space Space @relation(fields: [spaceId], references: [id])
}

model SpaceEntrance {
  id            String   @id @default(uuid())
  spaceId       String
  name          String
  gateNumber    String?
  gpsCoordinates Json?
  linkedZoneId  String?
  space         Space @relation(fields: [spaceId], references: [id])
}

model SpaceUser {
  id      String @id @default(uuid())
  userId  String
  spaceId String
  role    String? // manager, staff, viewer

  user  User  @relation(fields: [userId], references: [id])
  space Space @relation(fields: [spaceId], references: [id])

  @@unique([userId, spaceId])
}

model POS {
  id        String  @id @default(uuid())
  spaceId   String
  name      String
  type      PosType
  location  String?
  active    Boolean @default(true)
  createdAt DateTime @default(now())

  space      Space @relation(fields: [spaceId], references: [id])
  menus      Menu[]
  stocks     Stock[]
  sales      Sale[]
  eventPOS   EventPOS[]
}

model Storage {
  id        String   @id @default(uuid())
  spaceId   String
  name      String
  type      StorageType
  capacity  Decimal? @db.Decimal(10,2)
  createdAt DateTime @default(now())

  space   Space @relation(fields: [spaceId], references: [id])
  stocks  Stock[]
}

model VIPArea {
  id        String @id @default(uuid())
  spaceId   String
  name      String
  capacity  Int?
  type      String
  createdAt DateTime @default(now())

  space Space @relation(fields: [spaceId], references: [id])
}

model Unit {
  id   String @id @default(uuid())
  code String @unique
  label String
}

model Supplier {
  id           String @id @default(uuid())
  organisationId String?
  name         String
  contactInfo  Json?
  category     String?
  deliveryDays Json?
  paymentTerms String?
  rating       Int?
  active       Boolean @default(true)
  createdAt    DateTime @default(now())

  organisation Organisation? @relation(fields: [organisationId], references: [id])
  purchaseOrders PurchaseOrder[]
}

model PurchaseOrder {
  id             String   @id @default(uuid())
  supplierId     String
  organisationId String?
  total          Decimal  @db.Decimal(12,2)
  status         String
  orderedAt      DateTime?
  receivedAt     DateTime?
  createdById    String?

  supplier    Supplier @relation(fields: [supplierId], references: [id])
  purchaseItems PurchaseItem[]
  createdBy   User? @relation(fields: [createdById], references: [id], name: "purchase_by_user")
}

model PurchaseItem {
  id              String  @id @default(uuid())
  purchaseOrderId String
  productId       String?
  quantity        Decimal @db.Decimal(12,2)
  unitPrice       Decimal @db.Decimal(12,2)
  totalPrice      Decimal @db.Decimal(12,2)

  purchaseOrder PurchaseOrder @relation(fields: [purchaseOrderId], references: [id])
}

model Ingredient {
  id         String   @id @default(uuid())
  name       String
  unit       String?
  supplierId String?
  price      Decimal? @db.Decimal(12,2)
  perishable Boolean  @default(false)
  createdAt  DateTime @default(now())

  supplier Supplier? @relation(fields: [supplierId], references: [id])
  menuItemIngredients MenuItemIngredient[]
  preparedProducts PreparedProductIngredient[]
}

model Menu {
  id        String    @id @default(uuid())
  posId     String
  name      String
  category  String?
  active    Boolean   @default(true)

  pos       POS       @relation(fields: [posId], references: [id])
  items     MenuItem[]
}

model MenuItem {
  id          String   @id @default(uuid())
  menuId      String
  name        String
  description String?
  price       Decimal  @db.Decimal(12,2)
  supplierId  String?
  perishable  Boolean  @default(false)

  menu   Menu @relation(fields: [menuId], references: [id])
  supplier Supplier? @relation(fields: [supplierId], references: [id])
  ingredients MenuItemIngredient[]
  sales      Sale[]    @relation("sale_item")
}

model MenuItemIngredient {
  id          String  @id @default(uuid())
  menuItemId  String
  ingredientId String
  quantity    Decimal @db.Decimal(12,4)
  unit        String?

  menuItem   MenuItem   @relation(fields: [menuItemId], references: [id])
  ingredient Ingredient @relation(fields: [ingredientId], references: [id])

  @@unique([menuItemId, ingredientId])
}

model PreparedProduct {
  id              String  @id @default(uuid())
  name            String
  description     String?
  recipe          Json?
  preparationTime Int?
  costPrice       Decimal @db.Decimal(12,2)
  salePrice       Decimal @db.Decimal(12,2)
  perishable      Boolean @default(false)

  preparedIngredients PreparedProductIngredient[]
}

model PreparedProductIngredient {
  id                 String  @id @default(uuid())
  preparedProductId  String
  ingredientId       String
  quantity           Decimal @db.Decimal(12,4)
  unit               String?

  preparedProduct PreparedProduct @relation(fields: [preparedProductId], references: [id])
  ingredient      Ingredient @relation(fields: [ingredientId], references: [id])
}

model Stock {
  id         String   @id @default(uuid())
  posId      String?
  storageId  String?
  productId  String
  productType String? // "ingredient" or "prepared" or generic tag
  quantity   Decimal  @db.Decimal(12,4)
  unit       String?
  unitPrice  Decimal? @db.Decimal(12,2)
  minThreshold Decimal? @db.Decimal(12,4)
  lastUpdate DateTime @default(now())

  pos     POS?     @relation(fields: [posId], references: [id])
  storage Storage? @relation(fields: [storageId], references: [id])
  movements StockMovement[]
  alerts    StockAlert[]
}

model StockMovement {
  id         String   @id @default(uuid())
  stockId    String
  movementType MovementType
  quantity   Decimal  @db.Decimal(12,4)
  reason     String?
  userId     String?
  createdAt  DateTime @default(now())

  stock Stock @relation(fields: [stockId], references: [id])
  user  User?  @relation(fields: [userId], references: [id])
}

model RestockRequest {
  id             String  @id @default(uuid())
  requesterId    String
  fromStorageId  String?
  toPosId        String?
  status         String
  createdAt      DateTime @default(now())

  requester User @relation(fields: [requesterId], references: [id])
}

model StockAlert {
  id         String   @id @default(uuid())
  stockId    String
  alertType  AlertType
  triggeredAt DateTime @default(now())
  resolvedAt  DateTime?
  stock      Stock @relation(fields: [stockId], references: [id])
}

model EventCategory {
  id        String  @id @default(uuid())
  name      String
  description String?
  parentId  String?
}

model Event {
  id            String   @id @default(uuid())
  organisationId String?  @db.Uuid
  spaceId       String
  name          String
  category      String?
  subcategory   String?
  dateStart     DateTime
  dateEnd       DateTime
  status        EventStatus @default(DRAFT)
  revenueTarget Decimal? @db.Decimal(12,2)
  costTarget    Decimal? @db.Decimal(12,2)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  space       Space @relation(fields: [spaceId], references: [id])
  eventPOS    EventPOS[]
  eventStaff  EventStaff[]
  eventIntegrations EventIntegration[]
  ticketTypes TicketType[]
  schedules   EventSchedule[]
  tasks       EventTask[]
  sales       Sale[]
  predictive  PredictiveData[]
  financialReports FinancialReport[]
}

model EventPOS {
  id      String @id @default(uuid())
  eventId String
  posId   String

  event Event @relation(fields: [eventId], references: [id])
  pos   POS   @relation(fields: [posId], references: [id])

  @@unique([eventId, posId])
}

model EventStaff {
  id          String @id @default(uuid())
  eventId     String
  userId      String
  role        String?
  assignedZone String?
  costEstimate Decimal? @db.Decimal(12,2)

  event Event @relation(fields: [eventId], references: [id])
  user  User  @relation(fields: [userId], references: [id])
}

model EventIntegration {
  id            String   @id @default(uuid())
  eventId       String
  integrationId String
  active        Boolean  @default(true)

  event       Event       @relation(fields: [eventId], references: [id])
  integration Integration @relation(fields: [integrationId], references: [id])
}

model TicketType {
  id        String  @id @default(uuid())
  eventId   String
  name      String
  price     Decimal @db.Decimal(12,2)
  quota     Int
  sold      Int @default(0)
  externalRef String?

  event Event @relation(fields: [eventId], references: [id])
}

model EventSchedule {
  id        String  @id @default(uuid())
  eventId   String
  name      String
  startTime DateTime
  endTime   DateTime
  location  String?
  notes     String?

  event Event @relation(fields: [eventId], references: [id])
}

model EventTask {
  id         String  @id @default(uuid())
  eventId    String
  assignedTo String?
  title      String
  description String?
  status     String
  dueDate    DateTime?

  event Event @relation(fields: [eventId], references: [id])
}

model Integration {
  id           String   @id @default(uuid())
  organisationId String?
  name         String
  type         IntegrationTypeEnum
  credentials  Json?
  active       Boolean  @default(true)
  createdAt    DateTime @default(now())

  organisation Organisation? @relation(fields: [organisationId], references: [id])
  integrationLogs IntegrationLog[]
  eventIntegrations EventIntegration[]
}

model IntegrationType {
  id   String @id @default(uuid())
  key  String @unique
  name String
  description String?
  requiredFields Json?
}

model IntegrationLog {
  id            String  @id @default(uuid())
  integrationId String
  eventId       String?
  status        String
  payload       Json?
  response      Json?
  createdAt     DateTime @default(now())

  integration Integration @relation(fields: [integrationId], references: [id])
  event       Event? @relation(fields: [eventId], references: [id])
}

model Sale {
  id        String  @id @default(uuid())
  posId     String?
  eventId   String?
  itemId    String? // menu item or prepared product id
  itemType  String? // "menu_item" | "prepared_product" | "merch"
  quantity  Int
  unitPrice Decimal @db.Decimal(12,2)
  total     Decimal @db.Decimal(12,2)
  timestamp DateTime @default(now())

  pos   POS?   @relation(fields: [posId], references: [id])
  event Event? @relation(fields: [eventId], references: [id])
  payments Payment[]
}

model Payment {
  id        String  @id @default(uuid())
  saleId    String
  method    PaymentMethod
  amount    Decimal @db.Decimal(12,2)
  validatedAt DateTime?

  sale Sale @relation(fields: [saleId], references: [id])
}

model PredictiveData {
  id                  String  @id @default(uuid())
  eventId             String
  domain              String
  predictedManagers   Int?
  predictedStaff      Int?
  predictedCostManager Decimal? @db.Decimal(12,2)
  predictedCostStaff  Decimal? @db.Decimal(12,2)
  percapEstimation    Decimal? @db.Decimal(12,2)

  event Event @relation(fields: [eventId], references: [id])
}

model FinancialReport {
  id         String  @id @default(uuid())
  eventId    String?
  spaceId    String?
  revenue    Decimal @db.Decimal(14,2)
  cost       Decimal @db.Decimal(14,2)
  profit     Decimal @db.Decimal(14,2)
  margin     Decimal @db.Decimal(6,4)
  generatedAt DateTime @default(now())

  event Event? @relation(fields: [eventId], references: [id])
  space Space? @relation(fields: [spaceId], references: [id])
}

model KPIRecord {
  id         String  @id @default(uuid())
  scope      String
  scopeId    String
  metric     String
  value      Decimal @db.Decimal(14,4)
  periodStart DateTime
  periodEnd   DateTime
}

model ForecastScenario {
  id              String  @id @default(uuid())
  name            String
  eventId         String?
  parameters      Json?
  predictedRevenue Decimal? @db.Decimal(14,2)
  predictedCost    Decimal? @db.Decimal(14,2)
  createdById      String?
  createdAt       DateTime @default(now())
}

model BudgetLine {
  id       String @id @default(uuid())
  eventId  String
  category String
  amountEstimated Decimal @db.Decimal(12,2)
  amountActual    Decimal? @db.Decimal(12,2)
  variance        Decimal? @db.Decimal(12,2)

  event Event @relation(fields: [eventId], references: [id])
}

model Notification {
  id        String  @id @default(uuid())
  userId    String?
  type      String
  title     String
  message   String
  read      Boolean @default(false)
  createdAt DateTime @default(now())

  user User? @relation(fields: [userId], references: [id])
}

model AuditLog {
  id        String  @id @default(uuid())
  userId    String?
  entity    String
  entityId  String?
  action    String
  details   Json?
  ipAddress String?
  createdAt DateTime @default(now())

  // relation to user for convenience
  user User? @relation(fields: [userId], references: [id], name: "user_audit")
}

model SystemAlert {
  id        String  @id @default(uuid())
  level     AlertLevel
  source    String
  message   String
  status    AlertStatus @default(OPEN)
  createdAt DateTime @default(now())
  resolvedAt DateTime?
}

model Setting {
  id             String  @id @default(uuid())
  organisationId String
  key            String
  value          Json
  type           String?

  organisation Organisation @relation(fields: [organisationId], references: [id])

  @@unique([organisationId, key])
}
