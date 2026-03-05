const { sendMessageWithRetry } = window.URLBlockerUI;

const INTERNAL_URL_PREFIXES = [ 'chrome://', 'chrome-extension://', 'about:' ];
const DEFAULT_BUTTON_TEXT = 'Block Site';

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
        urlInput.focus();
        urlInput.select();
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
            url: url
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

function openSettings() {
    chrome.tabs.create( { url: chrome.runtime.getURL( 'src/settings.html' ) } );
    window.close();
}

function setupEventListeners() {
    const blockButton = document.getElementById( 'block-button' );
    if ( blockButton ) blockButton.addEventListener( 'click', blockUrl );

    const getCurrentButton = document.getElementById( 'get-current-button' );
    if ( getCurrentButton ) getCurrentButton.addEventListener( 'click', getCurrentUrl );

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

document.addEventListener( 'DOMContentLoaded', setupEventListeners );

if ( typeof module !== 'undefined' && module.exports ) {
    module.exports = {
        blockUrl,
        getCurrentUrl,
        openSettings,
        showError,
        clearError
    };
}
