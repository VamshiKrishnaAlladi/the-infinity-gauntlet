const { formatDuration, sendMessageWithRetry } = typeof require !== 'undefined'
    ? require( './utils/ui-helpers' )
    : window.URLBlockerUI;

const DEFAULT_BYPASS_DURATION = 600;
let blockedUrls = [];

function updateDurationHint( seconds ) {
    const hintElement = document.getElementById( 'duration-hint' );
    if ( hintElement ) hintElement.textContent = formatDuration( seconds );
}

function showStatus( message, type ) {
    const statusElement = document.getElementById( 'status-message' );
    if ( !statusElement ) return;
    statusElement.textContent = message;
    statusElement.className = `status-message ${type}`;
    setTimeout( () => {
        statusElement.className = 'status-message';
    }, 3000 );
}

function showError( message ) {
    const errorElement = document.getElementById( 'error-message' );
    if ( !errorElement ) return;
    errorElement.textContent = message;
    errorElement.classList.add( 'visible' );
    setTimeout( () => errorElement.classList.remove( 'visible' ), 3000 );
}

function renderUrlList( urls ) {
    const urlList = document.getElementById( 'url-list' );
    const emptyState = document.getElementById( 'empty-state' );

    if ( !urlList ) return;
    urlList.innerHTML = '';
    if ( emptyState ) emptyState.classList.toggle( 'visible', urls.length === 0 );
    if ( urls.length === 0 ) return;

    for ( const url of urls ) {
        const li = document.createElement( 'li' );
        li.className = 'url-item';

        const urlText = document.createElement( 'span' );
        urlText.className = 'url-text';
        urlText.textContent = url;

        const removeButton = document.createElement( 'button' );
        removeButton.className = 'remove-button';
        removeButton.textContent = 'Remove';
        removeButton.addEventListener( 'click', () => removeUrl( url ) );

        li.appendChild( urlText );
        li.appendChild( removeButton );
        urlList.appendChild( li );
    }
}

async function loadBlockedUrls() {
    try {
        const response = await sendMessageWithRetry( { type: 'getBlockedUrls' } );
        blockedUrls = response?.success ? response.urls || [] : [];
        renderUrlList( blockedUrls );
    } catch ( error ) {
        console.error( 'Failed to load blocked URLs:', error );
        showError( 'Failed to load blocked URLs' );
    }
}

async function addUrl() {
    const input = document.getElementById( 'url-input' );
    if ( !input ) return;

    const url = input.value.trim();

    if ( !url ) {
        showError( 'Please enter a valid URL' );
        return;
    }

    try {
        const response = await sendMessageWithRetry( {
            type: 'addUrl',
            url: url
        } );

        if ( response?.success ) {
            blockedUrls = response.urls || [ ...blockedUrls, url ];
            renderUrlList( blockedUrls );
            input.value = '';
            return;
        }
        showError( response?.error || 'Failed to add URL' );
    } catch ( error ) {
        console.error( 'Failed to add URL:', error );
        showError( 'Failed to add URL' );
    }
}

async function removeUrl( url ) {
    try {
        const response = await sendMessageWithRetry( {
            type: 'removeUrl',
            url: url
        } );

        if ( response?.success ) {
            blockedUrls = response.urls || blockedUrls.filter( u => u !== url );
            renderUrlList( blockedUrls );
            return;
        }
        showError( response?.error || 'Failed to remove URL' );
    } catch ( error ) {
        console.error( 'Failed to remove URL:', error );
        showError( 'Failed to remove URL' );
    }
}

async function loadSettings() {
    try {
        const result = await chrome.storage.sync.get( [ 'bypassDuration' ] );
        const duration = result.bypassDuration || DEFAULT_BYPASS_DURATION;

        const input = document.getElementById( 'bypass-duration' );
        if ( input ) {
            input.value = duration;
        }
        updateDurationHint( duration );
    } catch ( error ) {
        console.error( 'Failed to load settings:', error );
    }
}

async function saveSettings() {
    const input = document.getElementById( 'bypass-duration' );
    if ( !input ) return;

    const parsed = parseInt( input.value, 10 );
    const duration = Math.max( 10, Math.min( 3600, Number.isNaN( parsed ) ? 10 : parsed ) );
    input.value = String( duration );

    try {
        await chrome.storage.sync.set( { bypassDuration: duration } );
        showStatus( 'Settings saved!', 'success' );
        updateDurationHint( duration );
    } catch ( error ) {
        console.error( 'Failed to save settings:', error );
        showStatus( 'Failed to save settings', 'error' );
    }
}

function setupEventListeners() {
    const saveButton = document.getElementById( 'save-button' );
    const addUrlButton = document.getElementById( 'add-url-button' );
    const durationInput = document.getElementById( 'bypass-duration' );
    const urlInput = document.getElementById( 'url-input' );

    if ( saveButton ) saveButton.addEventListener( 'click', saveSettings );

    if ( addUrlButton ) addUrlButton.addEventListener( 'click', addUrl );

    if ( durationInput ) {
        durationInput.addEventListener( 'input', () => {
            const value = parseInt( durationInput.value, 10 );
            if ( !Number.isNaN( value ) && value > 0 ) updateDurationHint( value );
        } );
    }

    if ( urlInput ) {
        urlInput.addEventListener( 'keypress', ( e ) => {
            if ( e.key === 'Enter' ) addUrl();
        } );
    }
}

document.addEventListener( 'DOMContentLoaded', () => {
    loadSettings();
    loadBlockedUrls();
    setupEventListeners();
} );

if ( typeof module !== 'undefined' && module.exports ) {
    module.exports = {
        formatDuration,
        updateDurationHint,
        showStatus,
        showError,
        loadSettings,
        saveSettings,
        loadBlockedUrls,
        addUrl,
        removeUrl,
        renderUrlList,
        DEFAULT_BYPASS_DURATION
    };
}
