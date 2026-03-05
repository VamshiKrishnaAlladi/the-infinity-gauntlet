const STORAGE_KEY = 'blockedUrls';
const INTERNAL_URL_PREFIXES = [ 'chrome://', 'chrome-extension://', 'about:' ];
let blockedUrlsCache = [];
let bypassCache = {};
let bypassCheckInterval = null;
let badgeUpdateInterval = null;

function isInternalUrl( url ) {
    return typeof url === 'string' && INTERNAL_URL_PREFIXES.some( prefix => url.startsWith( prefix ) );
}

async function getBlockedUrls() {
    try {
        const result = await chrome.storage.sync.get( [ STORAGE_KEY ] );
        const urls = result[ STORAGE_KEY ] || [];
        blockedUrlsCache = [ ...urls ];
        return urls;
    } catch ( error ) {
        console.error( 'Service Worker: Error retrieving blocked URLs:', error );
        return [ ...blockedUrlsCache ];
    }
}

async function saveBlockedUrls( urls ) {
    blockedUrlsCache = [ ...urls ];

    try {
        await chrome.storage.sync.set( { [ STORAGE_KEY ]: urls } );
    } catch ( error ) {
        console.error( 'Service Worker: Error saving blocked URLs:', error );
        throw error;
    }
}

function validateUrl( url ) {
    return typeof url === 'string' && url.trim().length > 0;
}

function isDuplicate( url, list ) {
    if ( !Array.isArray( list ) ) return false;
    const normalizedUrl = url.toLowerCase().trim();
    return list.some( existingUrl => typeof existingUrl === 'string' && existingUrl.toLowerCase().trim() === normalizedUrl );
}

function isUrlBlocked( targetUrl, blockedList ) {
    if ( typeof targetUrl !== 'string' || !Array.isArray( blockedList ) ) return false;
    const normalizedTarget = targetUrl.toLowerCase().trim();
    if ( normalizedTarget.length === 0 ) return false;

    return blockedList.some( blockedPattern => {
        if ( typeof blockedPattern !== 'string' ) return false;
        const normalizedPattern = blockedPattern.toLowerCase().trim();
        return normalizedPattern.length > 0 && normalizedTarget.includes( normalizedPattern );
    } );
}

function hasActiveBypass( url ) {
    if ( typeof url !== 'string' ) return false;
    const normalizedUrl = url.toLowerCase().trim();
    const now = Date.now();

    for ( const [ pattern, expiration ] of Object.entries( bypassCache ) ) {
        if ( expiration <= now ) {
            delete bypassCache[ pattern ];
            continue;
        }
        if ( normalizedUrl.includes( pattern.toLowerCase() ) ) return true;
    }
    return false;
}

function addBypass( url, duration ) {
    if ( typeof url !== 'string' || !url.trim() ) return false;

    let pattern;
    try {
        pattern = new URL( url ).hostname;
    } catch {
        pattern = url.toLowerCase().trim();
    }
    const expiration = Date.now() + duration;
    bypassCache[ pattern ] = expiration;
    startBypassExpirationChecker();
    startBadgeUpdate();
    return true;
}

function removeExpiredBypasses() {
    const now = Date.now();
    let hadExpired = false;

    for ( const [ pattern, expiration ] of Object.entries( bypassCache ) ) {
        if ( expiration <= now ) {
            delete bypassCache[ pattern ];
            hadExpired = true;
        }
    }
    return hadExpired;
}

async function cleanupExpiredBypassesAndBlockTabs() {
    if ( removeExpiredBypasses() ) {
        const blockedUrls = await getBlockedUrls();
        await blockMatchingTabs( blockedUrls );
    }
    if ( Object.keys( bypassCache ).length === 0 ) stopBypassExpirationChecker();
}

function startBypassExpirationChecker() {
    if ( bypassCheckInterval ) return;
    bypassCheckInterval = setInterval( cleanupExpiredBypassesAndBlockTabs, 5000 );
}

function stopBypassExpirationChecker() {
    if ( bypassCheckInterval ) {
        clearInterval( bypassCheckInterval );
        bypassCheckInterval = null;
    }
}

function formatBadgeTime( remainingMs ) {
    if ( remainingMs <= 0 ) {
        return '';
    }

    const totalSeconds = Math.ceil( remainingMs / 1000 );
    const minutes = Math.floor( totalSeconds / 60 );
    const seconds = totalSeconds % 60;

    return minutes > 0 ? `${minutes}:${seconds.toString().padStart( 2, '0' )}` : `${seconds}s`;
}

function getShortestBypassRemaining() {
    const now = Date.now();
    let shortest = Infinity;

    for ( const expiration of Object.values( bypassCache ) ) {
        const remaining = expiration - now;
        if ( remaining > 0 && remaining < shortest ) {
            shortest = remaining;
        }
    }

    return shortest === Infinity ? 0 : shortest;
}

async function updateBadge() {
    try {
        const remaining = getShortestBypassRemaining();
        if ( remaining > 0 ) {
            await chrome.action.setBadgeText( { text: formatBadgeTime( remaining ) } );
            await chrome.action.setBadgeBackgroundColor( { color: '#6366f1' } );
        } else {
            await chrome.action.setBadgeText( { text: '' } );
            stopBadgeUpdate();
        }
    } catch ( error ) {
        console.error( 'Service Worker: Error updating badge:', error );
    }
}

function startBadgeUpdate() {
    if ( badgeUpdateInterval ) return;
    updateBadge();
    badgeUpdateInterval = setInterval( updateBadge, 1000 );
}

function stopBadgeUpdate() {
    if ( badgeUpdateInterval ) {
        clearInterval( badgeUpdateInterval );
        badgeUpdateInterval = null;
    }
}

async function blockMatchingTabs( blockedUrls ) {
    try {
        const tabs = await chrome.tabs.query( {} );
        const blockedPageUrl = chrome.runtime.getURL( 'src/blocked.html' );

        for ( const tab of tabs ) {
            if ( !tab.url || isInternalUrl( tab.url ) ) continue;

            if ( isUrlBlocked( tab.url, blockedUrls ) && !hasActiveBypass( tab.url ) ) {
                const redirectUrl = `${blockedPageUrl}?url=${encodeURIComponent( tab.url )}`;
                await chrome.tabs.update( tab.id, { url: redirectUrl } );
            }
        }
    } catch ( error ) {
        console.error( 'Service Worker: Error blocking matching tabs:', error );
    }
}

async function unblockMatchingTabs( remainingBlockedUrls ) {
    try {
        const tabs = await chrome.tabs.query( {} );
        const blockedPageUrl = chrome.runtime.getURL( 'src/blocked.html' );

        for ( const tab of tabs ) {
            if ( !tab.url || !tab.url.startsWith( blockedPageUrl ) ) continue;

            const originalUrl = new URL( tab.url ).searchParams.get( 'url' );
            if ( !originalUrl ) continue;
            if ( !isUrlBlocked( originalUrl, remainingBlockedUrls ) ) {
                await chrome.tabs.update( tab.id, { url: originalUrl } );
            }
        }
    } catch ( error ) {
        console.error( 'Service Worker: Error unblocking matching tabs:', error );
    }
}

chrome.runtime.onMessage.addListener( ( message, sender, sendResponse ) => {
    handleMessage( message )
        .then( sendResponse )
        .catch( error => {
            console.error( 'Service Worker: Message handler error:', error );
            sendResponse( { success: false, error: error.message } );
        } );
    return true;
} );

async function handleMessage( message ) {
    const { type, url, duration } = message;

    switch ( type ) {
        case 'getBlockedUrls':
            return { success: true, urls: await getBlockedUrls() };

        case 'addUrl': {
            if ( !validateUrl( url ) ) return { success: false, error: 'Please enter a valid URL' };

            const trimmedUrl = url.trim();
            const currentUrls = await getBlockedUrls();
            if ( isDuplicate( trimmedUrl, currentUrls ) ) return { success: false, error: 'This URL is already blocked' };

            const updatedUrls = [ ...currentUrls, trimmedUrl ];
            await saveBlockedUrls( updatedUrls );
            await blockMatchingTabs( updatedUrls );
            return { success: true, urls: updatedUrls };
        }

        case 'removeUrl': {
            if ( !validateUrl( url ) ) return { success: false, error: 'Please enter a valid URL' };

            const currentUrls = await getBlockedUrls();
            const normalized = url.toLowerCase().trim();
            const updatedUrls = currentUrls.filter(
                existing => typeof existing === 'string' && existing.toLowerCase().trim() !== normalized
            );
            await saveBlockedUrls( updatedUrls );
            await unblockMatchingTabs( updatedUrls );
            return { success: true, urls: updatedUrls };
        }

        case 'addBypass':
            return { success: addBypass( url, duration || 10 * 60 * 1000 ) };

        default:
            return { success: false, error: `Unknown message type: ${type}` };
    }
}

chrome.webNavigation.onBeforeNavigate.addListener( async ( details ) => {
    if ( details.frameId !== 0 ) return;

    try {
        const targetUrl = details.url;
        if ( isInternalUrl( targetUrl ) ) return;

        removeExpiredBypasses();
        if ( hasActiveBypass( targetUrl ) ) return;

        const blockedUrls = await getBlockedUrls();
        if ( isUrlBlocked( targetUrl, blockedUrls ) ) {
            const redirectUrl = `${chrome.runtime.getURL( 'src/blocked.html' )}?url=${encodeURIComponent( targetUrl )}`;
            await chrome.tabs.update( details.tabId, { url: redirectUrl } );
        }
    } catch ( error ) {
        console.error( 'Service Worker: Navigation handler error:', error );
    }
} );

async function initialize() {
    await getBlockedUrls();
}

initialize();

if ( typeof module !== 'undefined' && module.exports ) {
    module.exports = {
        getBlockedUrls,
        saveBlockedUrls,
        validateUrl,
        isDuplicate,
        isUrlBlocked,
        handleMessage,
        initialize,
        hasActiveBypass,
        addBypass,
        removeExpiredBypasses,
        cleanupExpiredBypassesAndBlockTabs,
        blockMatchingTabs,
        unblockMatchingTabs,
        startBypassExpirationChecker,
        stopBypassExpirationChecker,
        formatBadgeTime,
        getShortestBypassRemaining,
        updateBadge,
        startBadgeUpdate,
        stopBadgeUpdate,
        getBypassCache: () => bypassCache,
        resetBypassCache: () => { bypassCache = {}; },
        getBlockedUrlsCache: () => [ ...blockedUrlsCache ],
        resetBlockedUrlsCache: () => { blockedUrlsCache = []; },
        STORAGE_KEY,
        getBypassCheckInterval: () => bypassCheckInterval,
        getBadgeUpdateInterval: () => badgeUpdateInterval
    };
}
