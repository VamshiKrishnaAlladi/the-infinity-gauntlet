function mockLocationSearch( search, originalLocation ) {
    delete window.location;
    window.location = { ...originalLocation, search };
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
