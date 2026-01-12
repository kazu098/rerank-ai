---
title: "GSC Integration Errors"
description: "How to handle errors when integrating with Google Search Console"
category: "Troubleshooting"
order: 1
---

# GSC Integration Errors

This guide explains how to handle errors that occur when integrating with Google Search Console (GSC).

## Common Errors

### Authentication Error (401 Unauthorized)

**Cause**: Google account authentication token has expired

**Solution**:
1. Open "GSC Integration" on the settings page
2. Click "Re-authenticate"
3. Re-authenticate with your Google account

### Permission Error (403 Forbidden)

**Cause**: No access permission to GSC, or the re-authenticated account is not registered as the site owner/verifier

**Solution**:

#### 1. Verify Site Owner/Verifier in Google Search Console

1. Visit [Google Search Console](https://search.google.com/search-console)
2. Open "Settings" → "Ownership verification" from the left menu
3. Verify that the currently logged-in Google account is registered as the site owner or verifier

#### 2. If the Re-authenticated Account is Not Registered as Site Owner/Verifier

**Problem**: If the re-authenticated Google account is not registered as the site owner/verifier, a 403 error will occur.

**Solution**:

**Method A: Register as Site Owner/Verifier (Recommended)**

1. Visit [Google Search Console](https://search.google.com/search-console)
2. Log in with the re-authenticated Google account
3. Open "Settings" → "Ownership verification" from the left menu
4. Click "Add ownership verification method"
5. Select the **HTML tag** method (easiest)
6. Copy the displayed meta tag
7. Add the meta tag to the `<head>` section of your site
8. Click "Verify"

**Method B: Re-authenticate with the Correct Google Account**

1. Log out of ReRank AI
2. Log back in with the Google account registered as the site owner/verifier
3. Open "GSC Integration" on the settings page
4. Click "Re-authenticate"
5. Re-authenticate with the correct Google account

#### 3. If Managing with Multiple Google Accounts

- If **kazutaka.yoshinaga@gmail.com** works normally, that account is registered as the site owner/verifier
- If a 403 error occurs with a different Gmail account, that account may not be registered as the site owner/verifier
- Solution: Execute Method A or Method B above

#### 4. If 403 Error Persists After Re-authentication

If a 403 error persists after re-authentication, the following possibilities exist:

1. **Re-authenticated account is not registered as site owner/verifier**
   - Execute Method A or Method B above

2. **Access token has not been updated**
   - Access the dashboard and wait for the token to be automatically updated
   - Or, open "GSC Integration" on the settings page and click "Re-authenticate"

3. **Site URL format is incorrect**
   - Verify that the site URL is correctly registered in the format `https://example.com/`
   - If necessary, delete and re-register the site

### Token Expired

**Cause**: Refresh token has expired

**Solution**:
1. Open "GSC Integration" on the settings page
2. Click "Re-authenticate"
3. Re-authenticate with your Google account

## If Still Not Resolved

Please contact support.

- [Contact Form](/contact)
- Email: support@rerank-ai.com
