const { isUrlBlocked } = require( '../../src/service-worker' );

const BLOCKED_PAGE_URL = 'chrome-extension://test-extension-id/src/blocked.html';

function simulateNavigationInterception( targetUrl, blockedUrls ) {
    if ( targetUrl.startsWith( 'chrome://' ) ||
        targetUrl.startsWith( 'chrome-extension://' ) ||
        targetUrl.startsWith( 'about:' ) ) {
        return {
            blocked: false,
            reason: 'internal-url',
            redirectUrl: null
        };
    }

    if ( isUrlBlocked( targetUrl, blockedUrls ) ) {
        return {
            blocked: true,
            reason: 'matched-blocked-pattern',
            redirectUrl: `${BLOCKED_PAGE_URL}?url=${encodeURIComponent( targetUrl )}`
        };
    }

    return {
        blocked: false,
        reason: 'no-match',
        redirectUrl: null
    };
}

function createNavigationEvent( url, tabId = 1, frameId = 0 ) {
    return { url, tabId, frameId, timeStamp: Date.now() };
}

function urlDoesNotMatchAnyPattern( targetUrl, blockedPatterns ) {
    const normalizedTarget = targetUrl.toLowerCase().trim();
    return !blockedPatterns.some( pattern => {
        const normalizedPattern = ( String( pattern ) ).toLowerCase().trim();
        return normalizedTarget.includes( normalizedPattern );
    } );
}

module.exports = {
    simulateNavigationInterception,
    createNavigationEvent,
    urlDoesNotMatchAnyPattern
};
