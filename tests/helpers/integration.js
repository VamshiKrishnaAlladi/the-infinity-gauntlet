function mockLocationSearch( search ) {
    const base = 'http://localhost/jest-blocked-page';
    const href = search === '' || search === undefined
        ? base
        : `${base}${search.startsWith( '?' ) ? search : `?${search}`}`;
    window.history.replaceState( {}, '', href );
}

function setupBlockedUrlElement() {
    const blockedUrlElement = document.createElement( 'p' );
    blockedUrlElement.id = 'blocked-url';
    document.body.appendChild( blockedUrlElement );
}

module.exports = {
    mockLocationSearch,
    setupBlockedUrlElement
};
