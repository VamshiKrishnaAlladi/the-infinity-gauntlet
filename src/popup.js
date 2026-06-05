const { sendMessageWithRetry } = window.URLBlockerUI;

const INTERNAL_URL_PREFIXES = [ 'chrome://', 'chrome-extension://', 'about:' ];
const DEFAULT_BUTTON_TEXT = 'Block Site';
const DEFAULT_SCREENSHOT_BUTTON_TEXT = 'Capture Full Page';

function showError( message ) {
    const errorDiv = document.getElementById( 'error-message' );
    if ( !errorDiv ) return;
    errorDiv.textContent = message;
    errorDiv.classList.add( 'visible' );
    setTimeout( () => errorDiv.classList.remove( 'visible' ), 3000 );
}

function clearError() {
    const errorDiv = document.getElementById( 'error-message' );
    if ( errorDiv ) errorDiv.classList.remove( 'visible' );
}

function isInternalUrl( url ) {
    return INTERNAL_URL_PREFIXES.some( prefix => url.startsWith( prefix ) );
}

function setBlockButtonState( blockButton, { disabled, text, color = '' } ) {
    if ( !blockButton ) return;
    blockButton.disabled = disabled;
    blockButton.textContent = text;
    blockButton.style.backgroundColor = color;
}

function setScreenshotStatus( message ) {
    const status = document.getElementById( 'screenshot-status' );
    if ( status ) status.textContent = message || '';
}

function setScreenshotButtonState( screenshotButton, { disabled, text } ) {
    if ( !screenshotButton ) return;
    screenshotButton.disabled = disabled;
    screenshotButton.textContent = text;
}

async function getCurrentUrl() {
    try {
        const [ tab ] = await chrome.tabs.query( { active: true, currentWindow: true } );

        if ( !tab?.url ) {
            showError( 'Could not get current tab URL' );
            return;
        }

        if ( isInternalUrl( tab.url ) ) {
            showError( 'Cannot block browser pages' );
            return;
        }

        const urlInput = document.getElementById( 'url-input' );
        if ( !urlInput ) return;
        urlInput.value = tab.url;
        clearError();
    } catch ( error ) {
        console.error( 'Failed to get current tab:', error );
        showError( 'Failed to get current tab URL' );
    }
}

async function blockUrl() {
    const urlInput = document.getElementById( 'url-input' );
    const blockButton = document.getElementById( 'block-button' );

    if ( !urlInput ) return;

    const url = urlInput.value.trim();

    if ( !url ) {
        showError( 'Please enter a URL to block' );
        return;
    }

    setBlockButtonState( blockButton, { disabled: true, text: 'Blocking...' } );

    try {
        const response = await sendMessageWithRetry( {
            type: 'addUrl',
            url
        } );

        if ( response?.success ) {
            setBlockButtonState( blockButton, {
                disabled: true,
                text: '✓ Site Blocked!',
                color: '#10b981'
            } );
            setTimeout( () => window.close(), 800 );
            return;
        }

        showError( response?.error || 'Failed to block site' );
        setBlockButtonState( blockButton, { disabled: false, text: DEFAULT_BUTTON_TEXT } );
    } catch ( error ) {
        console.error( 'Failed to block URL:', error );
        showError( 'Failed to block site' );
        setBlockButtonState( blockButton, { disabled: false, text: DEFAULT_BUTTON_TEXT } );
    }
}

async function captureFullPageScreenshot() {
    const screenshotButton = document.getElementById( 'screenshot-button' );
    setScreenshotButtonState( screenshotButton, {
        disabled: true,
        text: 'Capturing...'
    } );
    setScreenshotStatus( 'Scrolling page and preparing screenshot...' );
    clearError();

    try {
        const response = await sendMessageWithRetry( {
            type: 'captureFullPageScreenshot'
        } );

        if ( response?.success ) {
            setScreenshotStatus( 'Screenshot opened for review.' );
            setTimeout( () => setScreenshotStatus( '' ), 2500 );
            return response;
        }

        showError( response?.error || 'Failed to capture screenshot' );
        setScreenshotStatus( '' );
        return response;
    } catch ( error ) {
        console.error( 'Failed to capture screenshot:', error );
        showError( 'Failed to capture screenshot' );
        setScreenshotStatus( '' );
        return { success: false, error: error.message };
    } finally {
        setScreenshotButtonState( screenshotButton, {
            disabled: false,
            text: DEFAULT_SCREENSHOT_BUTTON_TEXT
        } );
    }
}

function openSettings() {
    chrome.tabs.create( { url: chrome.runtime.getURL( 'src/settings.html' ) } );
    window.close();
}

function setupEventListeners() {
    const blockButton = document.getElementById( 'block-button' );
    if ( blockButton ) blockButton.addEventListener( 'click', blockUrl );

    const screenshotButton = document.getElementById( 'screenshot-button' );
    if ( screenshotButton ) screenshotButton.addEventListener( 'click', captureFullPageScreenshot );

    const settingsLink = document.getElementById( 'settings-link' );
    if ( settingsLink ) {
        settingsLink.addEventListener( 'click', ( e ) => {
            e.preventDefault();
            openSettings();
        } );
    }

    const urlInput = document.getElementById( 'url-input' );
    if ( urlInput ) {
        urlInput.addEventListener( 'keypress', ( e ) => {
            if ( e.key === 'Enter' ) blockUrl();
        } );
        urlInput.addEventListener( 'input', clearError );
    }
}

document.addEventListener( 'DOMContentLoaded', () => {
    setupEventListeners();
    getCurrentUrl();
} );

if ( typeof module !== 'undefined' && module.exports ) {
    module.exports = {
        blockUrl,
        captureFullPageScreenshot,
        getCurrentUrl,
        openSettings,
        showError,
        clearError
    };
}
