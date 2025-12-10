# Weezevent Authentication Troubleshooting Guide

## 🚨 Current Issue

The Weezevent OAuth authentication endpoint is returning **HTTP 404**, preventing event synchronization.

### Tested Endpoints (All Returning 404)
1. ❌ `POST https://api.weezevent.com/oauth/token`
2. ❌ `POST https://accounts.weezevent.com/oauth/token`

### Request Details
```bash
POST https://api.weezevent.com/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
&client_id=app_eat-is-family-da...
&client_secret=vBevODCIZxR7XEO5sIZ5...
&scope=transactions.read wallets.read events.read products.read users.read
```

**Response:** `HTTP/2 404` (No body)

---

## 🔍 Diagnostic Steps Completed

### ✅ What Works
1. **Application endpoints** - All API routes are correctly configured
2. **Supabase authentication** - JWT tokens obtained successfully
3. **Tenant/organization management** - Database operations working
4. **Weezevent configuration storage** - Credentials saved with encryption

### ❌ What's Blocked
1. **Weezevent OAuth authentication** - Cannot obtain access token
2. **Event synchronization** - Depends on valid access token
3. **API calls to Weezevent** - All require Bearer token

---

## 🎯 Possible Root Causes

### 1. API Endpoint Changed
**Likelihood:** High  
**Reason:** Both documented endpoints return 404

**Action:**
- Check Weezevent developer portal: https://developers.weezevent.com
- Contact Weezevent support for current OAuth endpoint
- Review latest API documentation

### 2. Credentials Configuration Issue
**Likelihood:** Medium  
**Reason:** Client ID format suggests it might need different authentication flow

**Action:**
- Verify credentials in Weezevent dashboard
- Check if credentials are for OAuth2 or different auth method
- Confirm client is properly configured for "Client Credentials Grant"

### 3. API Version or Migration
**Likelihood:** Medium  
**Reason:** Endpoint structure may have changed

**Action:**
- Check if API v2 or newer version exists
- Look for migration guides from Weezevent
- Test alternative base URLs (e.g., `https://api.weezevent.com/v2/oauth/token`)

### 4. Geographic or Account Restrictions
**Likelihood:** Low  
**Reason:** Credentials might be region-specific or require additional setup

**Action:**
- Verify account is in production mode (not sandbox)
- Check for IP whitelisting requirements
- Confirm account has API access enabled

---

## 🛠️ Recommended Actions

### Immediate (Priority 1)
1. **Contact Weezevent Support**
   - Email: support@weezevent.com or developers@weezevent.com
   - Provide:
     - Client ID: `app_eat-is-family-da...`
     - Error: OAuth endpoint returns 404
     - Request: Current OAuth endpoint URL and authentication guide

2. **Check Weezevent Dashboard**
   - Log into https://www.weezevent.com
   - Navigate to API/Developer settings
   - Look for updated documentation or endpoint URLs
   - Verify client credentials are active

### Short Term (Priority 2)
3. **Test Alternative Endpoints**
   ```bash
   # Test v2 API
   curl -X POST "https://api.weezevent.com/v2/oauth/token" ...
   
   # Test pay API directly
   curl -X POST "https://api.weezevent.com/pay/v1/oauth/token" ...
   
   # Test with different content type
   curl -X POST "https://api.weezevent.com/oauth/token" \
     -H "Content-Type: application/json" \
     -d '{"grant_type":"client_credentials",...}'
   ```

4. **Review Recent Weezevent Announcements**
   - Check for API deprecation notices
   - Look for authentication method changes
   - Review changelog if available

### Long Term (Priority 3)
5. **Implement Mock/Test Mode**
   - Create mock Weezevent responses for testing
   - Add environment variable to bypass real auth in dev
   - Create integration tests with mocked responses

6. **Add Better Error Handling**
   - Log full HTTP response (headers + body)
   - Add retry mechanism with exponential backoff
   - Implement circuit breaker pattern

---

## 📋 Information to Gather from Weezevent

When contacting Weezevent support, request:

1. **Current OAuth Endpoint**
   - Full URL for token endpoint
   - Required headers and parameters
   - Expected response format

2. **Authentication Flow**
   - Confirm Client Credentials Grant is supported
   - Any changes to OAuth2 implementation
   - Required scopes for events, transactions, products

3. **API Version**
   - Current stable version
   - Deprecation schedule for old versions
   - Migration guide if applicable

4. **Credentials Verification**
   - Confirm client ID and secret are valid
   - Check if additional configuration needed
   - Verify account permissions

5. **Rate Limits & Restrictions**
   - Request rate limits
   - IP whitelisting requirements
   - Geographic restrictions

---

## 🧪 Testing Scripts Available

### 1. Main Test Script (Working)
**File:** `/scripts/test-events-182509.sh`  
**Status:** ✅ Works up to Weezevent sync

```bash
./scripts/test-events-182509.sh
```

**Output:**
```
✅ Connecté à Supabase
✅ Tenant ID: cmietbpd9000314hdh20i9k8o
✅ Weezevent configuré
✅ Nombre total d'événements: 0
```

### 2. Extended Test with Sync (Blocked)
**File:** `/scripts/test-events-182509-fixed.sh`  
**Status:** ⚠️ Blocked by auth error

```bash
./scripts/test-events-182509-fixed.sh
```

**Error:**
```
⚠️  Synchronisation échouée
{
  "statusCode": 500,
  "message": "Authentication failed (404): Unknown error"
}
```

### 3. Direct OAuth Test (Diagnostic)
**File:** `/scripts/test-weezevent-auth.sh`  
**Status:** ❌ Returns 404

```bash
./scripts/test-weezevent-auth.sh
```

---

## 📝 Code Changes Ready

All application code is ready for Weezevent integration:

### Fixed Issues
- ✅ Authentication uses Supabase (not custom login)
- ✅ `WeezeventConfigDto` includes `weezeventOrganizationId`
- ✅ Integration service handles organization ID
- ✅ Event endpoints return paginated responses
- ✅ Test scripts handle API response structures

### Pending Weezevent Confirmation
- ⏳ OAuth endpoint URL
- ⏳ Credentials validation
- ⏳ API access verification

---

## 🔗 Resources

- **Weezevent Developer Portal:** https://developers.weezevent.com
- **API Documentation:** https://docapi.weezevent.com
- **WeezPay API Spec:** https://docapi.weezevent.com/weezpay.json
- **Support:** support@weezevent.com

---

## ✅ Next Steps Summary

1. **Today:** Contact Weezevent support with credential verification request
2. **This Week:** Obtain correct OAuth endpoint and test authentication
3. **After Auth Fixed:** Run `./scripts/test-events-182509-fixed.sh` for end-to-end test
4. **Production:** Deploy with verified credentials and monitor sync jobs

---

## 📞 Support Contact Template

```
Subject: OAuth Endpoint Returns 404 - Client Credentials Grant

Hello Weezevent Support,

We are integrating the Weezevent API (WeezPay) for organization ID 182509 
and encountering a 404 error when attempting OAuth authentication.

Details:
- Client ID: app_eat-is-family-da... (truncated for security)
- Endpoint: POST https://api.weezevent.com/oauth/token
- Grant Type: client_credentials
- Response: HTTP 404 (empty body)

Questions:
1. Is the OAuth endpoint URL still correct?
2. Are our credentials (client ID/secret) properly configured?
3. Has the authentication method changed?
4. Can you provide the current API authentication documentation?

We've tested both api.weezevent.com and accounts.weezevent.com with the 
same result. 

Looking forward to your guidance.

Best regards,
[Your Name]
```
