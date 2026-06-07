const STORAGE_KEY = 'blockedUrls';
const INTERNAL_URL_PREFIXES = [ 'chrome://', 'chrome-extension://', 'about:' ];
const SCREENSHOT_OFFSCREEN_URL = 'src/screenshot-stitcher.html';
const SCREENSHOT_CAPTURE_DELAY_MS = 700;
const SCREENSHOT_TILE_OVERLAP_PX = 600;
const MAX_SCREENSHOT_DIMENSION = 32767;
const MAX_SCREENSHOT_AREA = 120000000;
const SCREENSHOT_REVIEW_PAGE = 'src/screenshot-review.html';
let blockedUrlsCache = [];
let bypassCache = {};
let bypassCheckInterval = null;
let badgeUpdateInterval = null;
const reviewTabScreenshotIds = {};
let screenshotStore = typeof globalThis !== 'undefined' ? globalThis.InfinityGauntletScreenshotStore : undefined;

if ( !screenshotStore && typeof importScripts === 'function' ) {
    importScripts( 'screenshot-store.js' );
    screenshotStore = globalThis.InfinityGauntletScreenshotStore;
}

if ( !screenshotStore && typeof require !== 'undefined' ) {
    screenshotStore = require( './screenshot-store' );
}

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

function wait( ms ) {
    return new Promise( resolve => setTimeout( resolve, ms ) );
}

function padDatePart( value ) {
    return value.toString().padStart( 2, '0' );
}

function getLocalTimestampPrefix( date = new Date() ) {
    const year = date.getFullYear();
    const month = padDatePart( date.getMonth() + 1 );
    const day = padDatePart( date.getDate() );
    const hours = padDatePart( date.getHours() );
    const minutes = padDatePart( date.getMinutes() );
    const seconds = padDatePart( date.getSeconds() );

    return `${year}-${month}-${day} ${hours}-${minutes}-${seconds}`;
}

function sanitizeFilenamePart( value ) {
    return ( value || 'Untitled Page' )
        .replace( /[<>:"/\\|?*\u0000-\u001F]/g, ' ' )
        .replace( /\s+/g, ' ' )
        .trim()
        .slice( 0, 120 ) || 'Untitled Page';
}

function getScreenshotFilename( title, date = new Date() ) {
    const timestamp = getLocalTimestampPrefix( date );
    const pageTitle = sanitizeFilenamePart( title );
    return `[${timestamp}] ${pageTitle}.png`;
}

function buildScrollPositions( scrollHeight, viewportHeight ) {
    if ( scrollHeight <= viewportHeight ) return [ 0 ];

    const maxScrollY = Math.max( 0, scrollHeight - viewportHeight );
    const overlap = Math.min( SCREENSHOT_TILE_OVERLAP_PX, Math.floor( viewportHeight * 0.5 ) );
    const step = Math.max( 1, viewportHeight - overlap );
    const positions = [];

    for ( let y = 0; y < maxScrollY; y += step ) {
        positions.push( y );
    }

    positions.push( maxScrollY );
    return [ ...new Set( positions ) ];
}

async function executeInTab( tabId, func, args = [] ) {
    const [ result ] = await chrome.scripting.executeScript( {
        target: { tabId },
        func,
        args
    } );

    return result?.result;
}

async function executeInAllFrames( tabId, func, args = [] ) {
    try {
        return await chrome.scripting.executeScript( {
            target: {
                tabId,
                allFrames: true
            },
            func,
            args
        } );
    } catch ( error ) {
        console.error( 'Service Worker: Error injecting screenshot helper in all frames:', error );
        return chrome.scripting.executeScript( {
            target: { tabId },
            func,
            args
        } );
    }
}

function getScreenshotPageMetrics() {
    function isTransparentColor( color ) {
        return !color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)';
    }

    function getScreenshotBackgroundColor( scrollElement ) {
        const candidates = [
            scrollElement,
            document.body,
            document.documentElement
        ].filter( Boolean );

        for ( const element of candidates ) {
            const color = window.getComputedStyle( element ).backgroundColor;
            if ( !isTransparentColor( color ) ) return color;
        }

        return '#ffffff';
    }

    function getScrollElementScore( element ) {
        const scrollHeight = element.scrollHeight || 0;
        const clientHeight = element.clientHeight || 0;
        const scrollableHeight = scrollHeight - clientHeight;
        if ( scrollableHeight < 8 ) return 0;

        if ( element === document.documentElement || element === document.body || element === document.scrollingElement ) {
            return scrollableHeight * window.innerWidth;
        }

        const style = window.getComputedStyle( element );
        const overflowY = style.overflowY;
        const canScroll = overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay';
        if ( !canScroll ) return 0;

        const rect = element.getBoundingClientRect();
        const visibleWidth = Math.max( 0, Math.min( rect.right, window.innerWidth ) - Math.max( rect.left, 0 ) );
        const visibleHeight = Math.max( 0, Math.min( rect.bottom, window.innerHeight ) - Math.max( rect.top, 0 ) );
        const visibleArea = visibleWidth * visibleHeight;
        if ( visibleArea < window.innerWidth * window.innerHeight * 0.2 ) return 0;

        return scrollableHeight * visibleArea;
    }

    function getScrollElement() {
        const scrollingElement = document.scrollingElement || document.documentElement;
        const candidates = [
            scrollingElement,
            document.documentElement,
            document.body,
            ...Array.from( document.body?.querySelectorAll( '*' ) || [] )
        ].filter( Boolean );

        let bestElement = scrollingElement;
        let bestScore = getScrollElementScore( scrollingElement );

        for ( const element of candidates ) {
            const score = getScrollElementScore( element );
            if ( score > bestScore ) {
                bestScore = score;
                bestElement = element;
            }
        }

        return bestElement;
    }

    const scrollElement = getScrollElement();
    const isWindowScroll = scrollElement === document.documentElement || scrollElement === document.body;
    const rect = scrollElement.getBoundingClientRect();
    const scrollContainerTop = isWindowScroll ? 0 : Math.max( 0, rect.top );
    const scrollContainerBottom = isWindowScroll ? window.innerHeight : Math.min( window.innerHeight, rect.bottom );
    const scrollContainerLeft = isWindowScroll ? 0 : Math.max( 0, rect.left );
    const scrollContainerRight = isWindowScroll ? window.innerWidth : Math.min( window.innerWidth, rect.right );
    const captureViewportHeight = isWindowScroll
        ? window.innerHeight
        : Math.max( 1, Math.min( scrollElement.clientHeight, scrollContainerBottom - scrollContainerTop ) );
    const captureScrollHeight = isWindowScroll
        ? Math.max( document.documentElement.scrollHeight, document.body?.scrollHeight || 0, window.innerHeight )
        : scrollElement.scrollHeight;
    const scrollWidth = Math.max(
        scrollElement.scrollWidth,
        document.documentElement.scrollWidth,
        document.body?.scrollWidth || 0,
        window.innerWidth
    );
    const outputHeight = isWindowScroll
        ? captureScrollHeight
        : Math.ceil( scrollContainerTop + captureScrollHeight + Math.max( 0, window.innerHeight - scrollContainerBottom ) );
    const backgroundColor = getScreenshotBackgroundColor( scrollElement );

    return {
        scrollWidth,
        scrollHeight: outputHeight,
        captureScrollHeight,
        captureViewportHeight,
        scrollContainerTop,
        scrollContainerBottom,
        scrollContainerLeft,
        scrollContainerRight,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        scrollX: isWindowScroll ? window.scrollX : scrollElement.scrollLeft,
        scrollY: isWindowScroll ? window.scrollY : scrollElement.scrollTop,
        devicePixelRatio: window.devicePixelRatio || 1,
        backgroundColor,
        usesElementScroll: !isWindowScroll,
        title: document.title || 'page'
    };
}

function scrollPageForScreenshot( x, y ) {
    function getScrollElementScore( element ) {
        const scrollHeight = element.scrollHeight || 0;
        const clientHeight = element.clientHeight || 0;
        const scrollableHeight = scrollHeight - clientHeight;
        if ( scrollableHeight < 8 ) return 0;

        if ( element === document.documentElement || element === document.body || element === document.scrollingElement ) {
            return scrollableHeight * window.innerWidth;
        }

        const style = window.getComputedStyle( element );
        const overflowY = style.overflowY;
        const canScroll = overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay';
        if ( !canScroll ) return 0;

        const rect = element.getBoundingClientRect();
        const visibleWidth = Math.max( 0, Math.min( rect.right, window.innerWidth ) - Math.max( rect.left, 0 ) );
        const visibleHeight = Math.max( 0, Math.min( rect.bottom, window.innerHeight ) - Math.max( rect.top, 0 ) );
        const visibleArea = visibleWidth * visibleHeight;
        if ( visibleArea < window.innerWidth * window.innerHeight * 0.2 ) return 0;

        return scrollableHeight * visibleArea;
    }

    function getScrollElement() {
        const scrollingElement = document.scrollingElement || document.documentElement;
        const candidates = [
            scrollingElement,
            document.documentElement,
            document.body,
            ...Array.from( document.body?.querySelectorAll( '*' ) || [] )
        ].filter( Boolean );

        let bestElement = scrollingElement;
        let bestScore = getScrollElementScore( scrollingElement );

        for ( const element of candidates ) {
            const score = getScrollElementScore( element );
            if ( score > bestScore ) {
                bestScore = score;
                bestElement = element;
            }
        }

        return bestElement;
    }

    const scrollElement = getScrollElement();
    const isWindowScroll = scrollElement === document.documentElement || scrollElement === document.body;

    if ( isWindowScroll ) {
        window.scrollTo( x, y );
    } else {
        scrollElement.scrollLeft = x;
        scrollElement.scrollTop = y;
    }

    return {
        scrollX: isWindowScroll ? window.scrollX : scrollElement.scrollLeft,
        scrollY: isWindowScroll ? window.scrollY : scrollElement.scrollTop
    };
}

function prepareStickyElementsForScreenshot() {
    const scrollbarStyle = document.createElement( 'style' );
    scrollbarStyle.id = 'infinity-gauntlet-hide-scrollbars';
    scrollbarStyle.textContent = `
        * {
            scrollbar-width: none !important;
            scrollbar-gutter: auto !important;
        }
        *::-webkit-scrollbar {
            width: 0 !important;
            height: 0 !important;
            display: none !important;
        }
    `;
    document.documentElement.appendChild( scrollbarStyle );

    window.__infinityGauntletScreenshot = {
        trackedElements: [],
        trackedElementSet: new Set(),
        scrollbarStyle
    };

    return { prepared: true };
}

function setStickyElementsForScreenshot( mode ) {
    const state = window.__infinityGauntletScreenshot;
    if ( !state ) return { normalizedCount: 0 };

    const edgeThreshold = 16;
    const allElements = [
        document.documentElement,
        document.body,
        ...Array.from( document.body?.querySelectorAll( '*' ) || [] )
    ].filter( Boolean );

    function rememberElement( element ) {
        if ( state.trackedElementSet.has( element ) ) return;

        state.trackedElementSet.add( element );
        state.trackedElements.push( {
            element,
            styles: {
                position: element.style.getPropertyValue( 'position' ),
                top: element.style.getPropertyValue( 'top' ),
                right: element.style.getPropertyValue( 'right' ),
                bottom: element.style.getPropertyValue( 'bottom' ),
                left: element.style.getPropertyValue( 'left' ),
                width: element.style.getPropertyValue( 'width' ),
                height: element.style.getPropertyValue( 'height' )
            },
            priorities: {
                position: element.style.getPropertyPriority( 'position' ),
                top: element.style.getPropertyPriority( 'top' ),
                right: element.style.getPropertyPriority( 'right' ),
                bottom: element.style.getPropertyPriority( 'bottom' ),
                left: element.style.getPropertyPriority( 'left' ),
                width: element.style.getPropertyPriority( 'width' ),
                height: element.style.getPropertyPriority( 'height' )
            }
        } );
    }

    for ( const element of allElements ) {
        const style = window.getComputedStyle( element );
        if ( style.position !== 'fixed' && style.position !== 'sticky' ) continue;
        if ( style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0' ) continue;

        const rect = element.getBoundingClientRect();
        if ( rect.width < 40 || rect.height < 20 ) continue;

        const isBottomPinned = window.innerHeight - rect.bottom <= edgeThreshold && rect.top < window.innerHeight - edgeThreshold;
        const isWideFooter = isBottomPinned && rect.width >= window.innerWidth * 0.4;
        rememberElement( element );

        if ( style.position === 'sticky' ) {
            element.style.setProperty( 'position', 'relative', 'important' );
            element.style.setProperty( 'top', 'auto', 'important' );
            element.style.setProperty( 'right', 'auto', 'important' );
            element.style.setProperty( 'bottom', 'auto', 'important' );
            element.style.setProperty( 'left', 'auto', 'important' );
            continue;
        }

        const documentTop = isWideFooter
            ? Math.max( 0, document.documentElement.scrollHeight - rect.height )
            : window.scrollY + rect.top;
        const documentLeft = window.scrollX + rect.left;

        element.style.setProperty( 'position', 'absolute', 'important' );
        element.style.setProperty( 'top', `${documentTop}px`, 'important' );
        element.style.setProperty( 'left', `${documentLeft}px`, 'important' );
        element.style.setProperty( 'right', 'auto', 'important' );
        element.style.setProperty( 'bottom', 'auto', 'important' );
        element.style.setProperty( 'width', `${rect.width}px`, 'important' );
        element.style.setProperty( 'height', `${rect.height}px`, 'important' );
    }

    return { normalizedCount: state.trackedElements.length };
}

function restoreStickyElementsForScreenshot() {
    const state = window.__infinityGauntletScreenshot;
    if ( !state ) return { restoredCount: 0 };

    for ( const item of state.trackedElements ) {
        for ( const [ property, value ] of Object.entries( item.styles ) ) {
            item.element.style.setProperty( property, value, item.priorities[ property ] );
        }
    }

    state.scrollbarStyle?.remove();

    const restoredCount = state.trackedElements.length;
    delete window.__infinityGauntletScreenshot;
    return { restoredCount };
}

function validateScreenshotDimensions( metrics ) {
    if (
        metrics.scrollWidth > MAX_SCREENSHOT_DIMENSION ||
        metrics.scrollHeight > MAX_SCREENSHOT_DIMENSION ||
        metrics.scrollWidth * metrics.scrollHeight > MAX_SCREENSHOT_AREA
    ) {
        throw new Error( 'Page is too large to capture as a single screenshot' );
    }
}

async function getActiveCaptureTab() {
    const [ tab ] = await chrome.tabs.query( { active: true, currentWindow: true } );

    if ( typeof tab?.id !== 'number' || typeof tab?.windowId !== 'number' || !tab?.url ) {
        throw new Error( 'Could not get current tab' );
    }

    if ( isInternalUrl( tab.url ) ) {
        throw new Error( 'Cannot capture browser pages' );
    }

    return tab;
}

async function ensureScreenshotOffscreenDocument() {
    const offscreenUrl = chrome.runtime.getURL( SCREENSHOT_OFFSCREEN_URL );

    if ( chrome.runtime.getContexts ) {
        const contexts = await chrome.runtime.getContexts( {
            contextTypes: [ 'OFFSCREEN_DOCUMENT' ],
            documentUrls: [ offscreenUrl ]
        } );

        if ( contexts.length > 0 ) return;
    }

    try {
        await chrome.offscreen.createDocument( {
            url: SCREENSHOT_OFFSCREEN_URL,
            reasons: [ 'BLOBS' ],
            justification: 'Stitch scrolling screenshot tiles into one PNG image.'
        } );
    } catch ( error ) {
        if ( !error?.message?.includes( 'Only a single offscreen document' ) ) throw error;
    }
}

async function stitchScreenshotTiles( payload ) {
    await ensureScreenshotOffscreenDocument();
    const response = await chrome.runtime.sendMessage( {
        type: 'stitchScreenshotTiles',
        payload
    } );

    if ( !response?.success ) {
        throw new Error( response?.error || 'Failed to stitch screenshot' );
    }

    return response.dataUrl;
}

async function downloadScreenshot( dataUrl, title ) {
    return chrome.downloads.download( {
        url: dataUrl,
        filename: getScreenshotFilename( title ),
        saveAs: false
    } );
}

async function openScreenshotReviewTab( sourceTab, screenshotId ) {
    const createProperties = {
        url: chrome.runtime.getURL( `${SCREENSHOT_REVIEW_PAGE}?id=${encodeURIComponent( screenshotId )}` ),
        active: true,
        windowId: sourceTab.windowId
    };

    if ( typeof sourceTab.index === 'number' ) {
        createProperties.index = sourceTab.index + 1;
    }

    const reviewTab = await chrome.tabs.create( createProperties );
    if ( typeof reviewTab?.id === 'number' ) {
        reviewTabScreenshotIds[ reviewTab.id ] = screenshotId;
    }
    return reviewTab;
}

async function storeScreenshotForReview( dataUrl, title ) {
    await screenshotStore.deleteStaleTemporaryScreenshots();
    const record = await screenshotStore.putTemporaryScreenshot( {
        dataUrl,
        title
    } );
    return record.id;
}

async function captureFullPageScreenshot() {
    const tab = await getActiveCaptureTab();
    const metrics = await executeInTab( tab.id, getScreenshotPageMetrics );
    validateScreenshotDimensions( metrics );

    const scrollPositions = buildScrollPositions(
        metrics.captureScrollHeight || metrics.scrollHeight,
        metrics.captureViewportHeight || metrics.viewportHeight
    );
    const tiles = [];

    try {
        await executeInTab( tab.id, scrollPageForScreenshot, [ 0, 0 ] );
        await wait( SCREENSHOT_CAPTURE_DELAY_MS );
        await executeInAllFrames( tab.id, prepareStickyElementsForScreenshot );

        for ( let index = 0; index < scrollPositions.length; index++ ) {
            const y = scrollPositions[ index ];
            const mode = scrollPositions.length === 1
                ? 'single'
                : index === 0
                ? 'first'
                : index === scrollPositions.length - 1
                    ? 'last'
                    : 'middle';

            const scrollResult = await executeInTab( tab.id, scrollPageForScreenshot, [ 0, y ] );
            await executeInAllFrames( tab.id, setStickyElementsForScreenshot, [ mode ] );
            await wait( SCREENSHOT_CAPTURE_DELAY_MS );

            const dataUrl = await chrome.tabs.captureVisibleTab( tab.windowId, { format: 'png' } );
            tiles.push( {
                dataUrl,
                x: scrollResult?.scrollX || 0,
                y: scrollResult?.scrollY || y,
                mode
            } );
        }
    } finally {
        try {
            await executeInAllFrames( tab.id, restoreStickyElementsForScreenshot );
            await executeInTab( tab.id, scrollPageForScreenshot, [ metrics.scrollX, metrics.scrollY ] );
        } catch ( error ) {
            console.error( 'Service Worker: Error restoring page after screenshot:', error );
        }
    }

    const dataUrl = await stitchScreenshotTiles( {
        metrics,
        tiles
    } );
    const screenshotId = await storeScreenshotForReview( dataUrl, metrics.title );
    const reviewTab = await openScreenshotReviewTab( tab, screenshotId );

    return {
        success: true,
        screenshotId,
        reviewTabId: reviewTab?.id,
        tileCount: tiles.length
    };
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

        case 'captureFullPageScreenshot':
            return captureFullPageScreenshot();

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

if ( chrome.tabs?.onRemoved ) {
    chrome.tabs.onRemoved.addListener( tabId => {
        const screenshotId = reviewTabScreenshotIds[ tabId ];
        if ( !screenshotId ) return;

        delete reviewTabScreenshotIds[ tabId ];
        screenshotStore.deleteTemporaryScreenshot( screenshotId ).catch( error => {
            console.error( 'Service Worker: Error deleting temporary screenshot after review tab close:', error );
        } );
    } );
}

async function initialize() {
    await screenshotStore.deleteStaleTemporaryScreenshots();
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
        buildScrollPositions,
        getScreenshotFilename,
        captureFullPageScreenshot,
        storeScreenshotForReview,
        openScreenshotReviewTab,
        downloadScreenshot,
        getReviewTabScreenshotIds: () => ( { ...reviewTabScreenshotIds } ),
        getScreenshotPageMetrics,
        prepareStickyElementsForScreenshot,
        setStickyElementsForScreenshot,
        restoreStickyElementsForScreenshot,
        getBypassCache: () => bypassCache,
        resetBypassCache: () => { bypassCache = {}; },
        getBlockedUrlsCache: () => [ ...blockedUrlsCache ],
        resetBlockedUrlsCache: () => { blockedUrlsCache = []; },
        STORAGE_KEY,
        getBypassCheckInterval: () => bypassCheckInterval,
        getBadgeUpdateInterval: () => badgeUpdateInterval
    };
}
