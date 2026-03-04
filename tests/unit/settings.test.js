const {
    showError,
    showStatus,
    renderUrlList,
    loadBlockedUrls,
    addUrl,
    removeUrl,
    formatDuration,
    updateDurationHint,
    loadSettings,
    saveSettings,
    DEFAULT_BYPASS_DURATION
} = require( '../../src/settings' );

describe( 'Settings UI Module', () => {
    let urlInput;
    let addUrlButton;
    let errorMessage;
    let statusMessage;
    let urlList;
    let emptyState;
    let bypassDurationInput;
    let durationHint;

    function setupDOM() {
        urlInput = document.createElement( 'input' );
        urlInput.id = 'url-input';

        addUrlButton = document.createElement( 'button' );
        addUrlButton.id = 'add-url-button';

        errorMessage = document.createElement( 'div' );
        errorMessage.id = 'error-message';
        errorMessage.className = 'error-message';

        statusMessage = document.createElement( 'div' );
        statusMessage.id = 'status-message';
        statusMessage.className = 'status-message';

        urlList = document.createElement( 'ul' );
        urlList.id = 'url-list';
        urlList.className = 'url-list';

        emptyState = document.createElement( 'div' );
        emptyState.id = 'empty-state';
        emptyState.className = 'empty-state';

        bypassDurationInput = document.createElement( 'input' );
        bypassDurationInput.id = 'bypass-duration';
        bypassDurationInput.type = 'number';
        bypassDurationInput.value = '600';

        durationHint = document.createElement( 'p' );
        durationHint.id = 'duration-hint';

        document.body.appendChild( urlInput );
        document.body.appendChild( addUrlButton );
        document.body.appendChild( errorMessage );
        document.body.appendChild( statusMessage );
        document.body.appendChild( urlList );
        document.body.appendChild( emptyState );
        document.body.appendChild( bypassDurationInput );
        document.body.appendChild( durationHint );
    }

    function cleanupDOM() {
        document.body.innerHTML = '';
    }

    beforeEach( () => {
        setupDOM();
        jest.clearAllMocks();
    } );

    afterEach( () => {
        cleanupDOM();
    } );

    describe( 'URL List Rendering', () => {
        it( 'should render all URLs in the list', () => {
            const urls = [ 'youtube.com', 'twitter.com', 'facebook.com' ];

            renderUrlList( urls );

            const listItems = urlList.querySelectorAll( 'li' );
            expect( listItems.length ).toBe( 3 );
        } );

        it( 'should render each URL with a remove button', () => {
            const urls = [ 'youtube.com', 'twitter.com' ];

            renderUrlList( urls );

            const removeButtons = urlList.querySelectorAll( '.remove-button' );
            expect( removeButtons.length ).toBe( 2 );
        } );

        it( 'should display correct URL text for each item', () => {
            const urls = [ 'youtube.com', 'twitter.com' ];

            renderUrlList( urls );

            const urlTexts = urlList.querySelectorAll( '.url-text' );
            expect( urlTexts[ 0 ].textContent ).toBe( 'youtube.com' );
            expect( urlTexts[ 1 ].textContent ).toBe( 'twitter.com' );
        } );

        it( 'should show empty state when no URLs are blocked', () => {
            renderUrlList( [] );

            expect( emptyState.classList.contains( 'visible' ) ).toBe( true );
        } );

        it( 'should hide empty state when URLs are blocked', () => {
            renderUrlList( [ 'youtube.com' ] );

            expect( emptyState.classList.contains( 'visible' ) ).toBe( false );
        } );
    } );

    describe( 'Error and Status Messages', () => {
        it( 'should display error message', () => {
            showError( 'Test error' );

            expect( errorMessage.textContent ).toBe( 'Test error' );
            expect( errorMessage.classList.contains( 'visible' ) ).toBe( true );
        } );

        it( 'should display status message', () => {
            showStatus( 'Settings saved!', 'success' );

            expect( statusMessage.textContent ).toBe( 'Settings saved!' );
            expect( statusMessage.classList.contains( 'success' ) ).toBe( true );
        } );
    } );

    describe( 'Duration Formatting', () => {
        it( 'should format seconds correctly', () => {
            expect( formatDuration( 30 ) ).toBe( '30 seconds' );
            expect( formatDuration( 1 ) ).toBe( '1 second' );
        } );

        it( 'should format minutes correctly', () => {
            expect( formatDuration( 60 ) ).toBe( '1 minute' );
            expect( formatDuration( 120 ) ).toBe( '2 minutes' );
        } );

        it( 'should format minutes and seconds correctly', () => {
            expect( formatDuration( 90 ) ).toBe( '1 min 30 sec' );
            expect( formatDuration( 125 ) ).toBe( '2 min 5 sec' );
        } );
    } );

    describe( 'URL Management', () => {
        it( 'should add URL successfully', async () => {
            urlInput.value = 'newsite.com';

            chrome.runtime.sendMessage.mockResolvedValue( {
                success: true,
                urls: [ 'newsite.com' ]
            } );

            await addUrl();

            expect( chrome.runtime.sendMessage ).toHaveBeenCalledWith( {
                type: 'addUrl',
                url: 'newsite.com'
            } );

            expect( urlInput.value ).toBe( '' );
        } );

        it( 'should show error for empty URL', async () => {
            urlInput.value = '';

            await addUrl();

            expect( errorMessage.textContent ).toBe( 'Please enter a valid URL' );
        } );

        it( 'should remove URL successfully', async () => {
            chrome.runtime.sendMessage.mockResolvedValue( {
                success: true,
                urls: []
            } );

            await removeUrl( 'youtube.com' );

            expect( chrome.runtime.sendMessage ).toHaveBeenCalledWith( {
                type: 'removeUrl',
                url: 'youtube.com'
            } );
        } );

        it( 'should load blocked URLs', async () => {
            chrome.runtime.sendMessage.mockResolvedValue( {
                success: true,
                urls: [ 'youtube.com', 'twitter.com' ]
            } );

            await loadBlockedUrls();

            const listItems = urlList.querySelectorAll( 'li' );
            expect( listItems.length ).toBe( 2 );
        } );
    } );

    describe( 'Settings Management', () => {
        it( 'should load settings', async () => {
            chrome.storage.sync.get.mockResolvedValue( {
                bypassDuration: 300
            } );

            await loadSettings();

            expect( bypassDurationInput.value ).toBe( '300' );
        } );

        it( 'should save settings', async () => {
            bypassDurationInput.value = '450';

            chrome.storage.sync.set.mockResolvedValue();

            await saveSettings();

            expect( chrome.storage.sync.set ).toHaveBeenCalledWith( {
                bypassDuration: 450
            } );
        } );

        it( 'should enforce minimum bypass duration', async () => {
            bypassDurationInput.value = '5';

            chrome.storage.sync.set.mockResolvedValue();

            await saveSettings();

            expect( bypassDurationInput.value ).toBe( '10' );
            expect( chrome.storage.sync.set ).toHaveBeenCalledWith( {
                bypassDuration: 10
            } );
        } );

        it( 'should enforce maximum bypass duration', async () => {
            bypassDurationInput.value = '5000';

            chrome.storage.sync.set.mockResolvedValue();

            await saveSettings();

            expect( bypassDurationInput.value ).toBe( '3600' );
            expect( chrome.storage.sync.set ).toHaveBeenCalledWith( {
                bypassDuration: 3600
            } );
        } );
    } );
} );
