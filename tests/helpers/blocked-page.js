const BLOCKED_HTML = 'chrome-extension://test-extension-id/src/blocked.html';

const BLOCKED_PAGE_HTML = `
    <div class="blocked-container">
        <div class="blocked-icon">🚫</div>
        <h1>URL Blocked</h1>
        <p class="blocked-url" id="blocked-url"></p>
        <p class="blocked-message">
            This URL has been blocked by The Infinity Gauntlet extension.
        </p>
    </div>
`;

function setupBlockedPageDOM() {
    document.body.innerHTML = BLOCKED_PAGE_HTML;
}

function setBlockedUrlParam( blockedUrl ) {
    const encodedUrl = encodeURIComponent( blockedUrl );
    delete window.location;
    window.location = {
        search: `?url=${encodedUrl}`,
        href: `${BLOCKED_HTML}?url=${encodedUrl}`
    };
}

function clearBlockedUrlParam() {
    delete window.location;
    window.location = { search: '', href: BLOCKED_HTML };
}

function checkBlockedPageDisplay() {
    const blockedUrlElement = document.getElementById( 'blocked-url' );
    const blockedMessageElement = document.querySelector( '.blocked-message' );
    const headingElement = document.querySelector( 'h1' );

    return {
        hasUrlElement: blockedUrlElement !== null,
        hasMessageElement: blockedMessageElement !== null,
        hasHeading: headingElement !== null,
        urlContent: blockedUrlElement ? blockedUrlElement.textContent : null,
        messageContent: blockedMessageElement ? blockedMessageElement.textContent : null,
        headingContent: headingElement ? headingElement.textContent : null
    };
}

function extractDomain( url ) {
    let domain = String( url || '' ).replace( /^https?:\/\//, '' );
    domain = domain.split( '/' )[ 0 ];
    domain = domain.split( '?' )[ 0 ];
    return domain.toLowerCase();
}

function checkContentIsolation( blockedDomain ) {
    const results = {
        hasExternalScripts: false,
        hasExternalStyles: false,
        hasExternalImages: false,
        hasExternalIframes: false,
        hasExternalLinks: false,
        hasExternalObjects: false,
        hasExternalEmbeds: false,
        hasExternalForms: false,
        violatingElements: []
    };

    const check = ( selector, attr, key ) => {
        document.querySelectorAll( selector ).forEach( el => {
            const val = el.getAttribute( attr ) || '';
            if ( val.toLowerCase().includes( blockedDomain ) ) {
                results[ key ] = true;
                results.violatingElements.push( { type: key, [ attr ]: val } );
            }
        } );
    };

    check( 'script[src]', 'src', 'hasExternalScripts' );
    check( 'link[href]', 'href', 'hasExternalStyles' );
    check( 'img[src]', 'src', 'hasExternalImages' );
    check( 'iframe[src]', 'src', 'hasExternalIframes' );
    document.querySelectorAll( 'a[href]' ).forEach( a => {
        const href = a.getAttribute( 'href' ) || '';
        if ( href.toLowerCase().includes( blockedDomain ) ) {
            results.hasExternalLinks = true;
            results.violatingElements.push( { type: 'a', href } );
        }
    } );
    check( 'object[data]', 'data', 'hasExternalObjects' );
    check( 'embed[src]', 'src', 'hasExternalEmbeds' );
    check( 'form[action]', 'action', 'hasExternalForms' );

    document.querySelectorAll( '[style]' ).forEach( el => {
        const style = el.getAttribute( 'style' ) || '';
        if ( style.toLowerCase().includes( blockedDomain ) ) {
            results.violatingElements.push( { type: 'style-attr', style } );
        }
    } );

    return results;
}

function isPageIsolated( blockedDomain ) {
    const isolation = checkContentIsolation( blockedDomain );
    const externalFlags = [
        'hasExternalScripts',
        'hasExternalStyles',
        'hasExternalImages',
        'hasExternalIframes',
        'hasExternalLinks',
        'hasExternalObjects',
        'hasExternalEmbeds',
        'hasExternalForms'
    ];
    return externalFlags.every( key => !isolation[ key ] ) && isolation.violatingElements.length === 0;
}

module.exports = {
    setupBlockedPageDOM,
    setBlockedUrlParam,
    clearBlockedUrlParam,
    checkBlockedPageDisplay,
    extractDomain,
    checkContentIsolation,
    isPageIsolated
};
