const {
    showError,
    clearError,
    blockUrl,
    captureFullPageScreenshot,
    getCurrentUrl,
    openSettings
} = require( '../../src/popup' );

describe( 'Popup UI Module', () => {
    let urlInput;
    let blockButton;
    let screenshotButton;
    let screenshotStatus;
    let errorMessage;
    let settingsLink;

    function setupDOM() {
        urlInput = document.createElement( 'input' );
        urlInput.id = 'url-input';
        urlInput.type = 'text';

        blockButton = document.createElement( 'button' );
        blockButton.id = 'block-button';
        blockButton.textContent = 'Block Site';

        screenshotButton = document.createElement( 'button' );
        screenshotButton.id = 'screenshot-button';
        screenshotButton.textContent = 'Capture Full Page';

        screenshotStatus = document.createElement( 'p' );
        screenshotStatus.id = 'screenshot-status';

        errorMessage = document.createElement( 'div' );
        errorMessage.id = 'error-message';
        errorMessage.className = 'error-message';

        settingsLink = document.createElement( 'a' );
        settingsLink.id = 'settings-link';
        settingsLink.href = '#';

        document.body.appendChild( urlInput );
        document.body.appendChild( blockButton );
        document.body.appendChild( screenshotButton );
        document.body.appendChild( screenshotStatus );
        document.body.appendChild( errorMessage );
        document.body.appendChild( settingsLink );
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

    describe( 'Error Message Display', () => {
        it( 'should display error message text', () => {
            showError( 'Please enter a URL to block' );

            expect( errorMessage.textContent ).toBe( 'Please enter a URL to block' );
        } );

        it( 'should add visible class to error message', () => {
            showError( 'Test error' );

            expect( errorMessage.classList.contains( 'visible' ) ).toBe( true );
        } );

        it( 'should clear error message', () => {
            showError( 'Some error' );
            clearError();

            expect( errorMessage.classList.contains( 'visible' ) ).toBe( false );
        } );
    } );

    describe( 'Block URL Functionality', () => {
        it( 'should show error for empty URL input', async () => {
            urlInput.value = '';

            await blockUrl();

            expect( errorMessage.textContent ).toBe( 'Please enter a URL to block' );
            expect( errorMessage.classList.contains( 'visible' ) ).toBe( true );
        } );

        it( 'should show error for whitespace-only URL input', async () => {
            urlInput.value = '   ';

            await blockUrl();

            expect( errorMessage.textContent ).toBe( 'Please enter a URL to block' );
            expect( errorMessage.classList.contains( 'visible' ) ).toBe( true );
        } );

        it( 'should send message to service worker with URL', async () => {
            urlInput.value = 'youtube.com';

            chrome.runtime.sendMessage.mockResolvedValue( {
                success: true
            } );

            await blockUrl();

            expect( chrome.runtime.sendMessage ).toHaveBeenCalledWith( {
                type: 'addUrl',
                url: 'youtube.com'
            } );
        } );

        it( 'should handle successful URL blocking', async () => {
            urlInput.value = 'youtube.com';
            blockButton.textContent = 'Block Site';

            chrome.runtime.sendMessage.mockResolvedValue( {
                success: true
            } );

            // Mock window.close
            global.window.close = jest.fn();

            await blockUrl();

            expect( blockButton.textContent ).toBe( '✓ Site Blocked!' );
        } );

        it( 'should handle blocking failure', async () => {
            urlInput.value = 'youtube.com';

            chrome.runtime.sendMessage.mockResolvedValue( {
                success: false,
                error: 'Storage error'
            } );

            await blockUrl();

            expect( errorMessage.textContent ).toBe( 'Storage error' );
            expect( errorMessage.classList.contains( 'visible' ) ).toBe( true );
        } );
    } );

    describe( 'Get Current URL Functionality', () => {
        it( 'should populate input with current tab URL', async () => {
            chrome.tabs.query.mockResolvedValue( [
                { url: 'https://youtube.com/watch?v=123' }
            ] );

            await getCurrentUrl();

            expect( urlInput.value ).toBe( 'https://youtube.com/watch?v=123' );
        } );

        it( 'should show error for chrome:// URLs', async () => {
            chrome.tabs.query.mockResolvedValue( [
                { url: 'chrome://extensions' }
            ] );

            await getCurrentUrl();

            expect( errorMessage.textContent ).toBe( 'Cannot block browser pages' );
        } );

        it( 'should show error for extension URLs', async () => {
            chrome.tabs.query.mockResolvedValue( [
                { url: 'chrome-extension://abc123/popup.html' }
            ] );

            await getCurrentUrl();

            expect( errorMessage.textContent ).toBe( 'Cannot block browser pages' );
        } );

        it( 'should show error when no tab URL available', async () => {
            chrome.tabs.query.mockResolvedValue( [ {} ] );

            await getCurrentUrl();

            expect( errorMessage.textContent ).toBe( 'Could not get current tab URL' );
        } );
    } );

    describe( 'Full Page Screenshot Functionality', () => {
        it( 'should send screenshot message to service worker', async () => {
            chrome.runtime.sendMessage.mockResolvedValue( {
                success: true
            } );

            await captureFullPageScreenshot();

            expect( chrome.runtime.sendMessage ).toHaveBeenCalledWith( {
                type: 'captureFullPageScreenshot'
            } );
        } );

        it( 'should show status when screenshot succeeds', async () => {
            chrome.runtime.sendMessage.mockResolvedValue( {
                success: true
            } );

            await captureFullPageScreenshot();

            expect( screenshotStatus.textContent ).toBe( 'Screenshot opened for review.' );
            expect( screenshotButton.disabled ).toBe( false );
        } );

        it( 'should show service worker error when screenshot fails', async () => {
            chrome.runtime.sendMessage.mockResolvedValue( {
                success: false,
                error: 'Cannot capture browser pages'
            } );

            await captureFullPageScreenshot();

            expect( errorMessage.textContent ).toBe( 'Cannot capture browser pages' );
            expect( errorMessage.classList.contains( 'visible' ) ).toBe( true );
            expect( screenshotButton.disabled ).toBe( false );
        } );
    } );

} );
