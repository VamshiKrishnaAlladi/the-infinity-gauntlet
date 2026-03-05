const { formatDuration } = window.URLBlockerUI;

const DEFAULT_BYPASS_DURATION = 600;

function getBlockedUrl() {
    return new URLSearchParams( window.location.search ).get( 'url' ) || '';
}

function displayBlockedMessage( url ) {
    const blockedUrlElement = document.getElementById( 'blocked-url' );
    if ( blockedUrlElement ) blockedUrlElement.textContent = url || 'Unknown URL';
}

async function getBypassDuration() {
    try {
        const result = await chrome.storage.sync.get( [ 'bypassDuration' ] );
        return result.bypassDuration || DEFAULT_BYPASS_DURATION;
    } catch ( error ) {
        console.error( 'Failed to get bypass duration:', error );
        return DEFAULT_BYPASS_DURATION;
    }
}

async function updateBypassButtonText() {
    const bypassButton = document.getElementById( 'bypass-button' );
    const bypassInfo = document.querySelector( '.bypass-info' );

    if ( !bypassButton ) return;
    const duration = await getBypassDuration();
    const formattedDuration = formatDuration( duration );
    bypassButton.textContent = `Allow for ${formattedDuration}`;
    if ( bypassInfo ) {
        bypassInfo.textContent = `You'll be redirected to the site. The block will resume after ${formattedDuration}.`;
    }
}

async function requestBypass( url ) {
    try {
        const durationSeconds = await getBypassDuration();
        const durationMs = durationSeconds * 1000;

        const response = await chrome.runtime.sendMessage( {
            type: 'addBypass',
            url: url,
            duration: durationMs
        } );

        return response?.success;
    } catch ( error ) {
        console.error( 'Failed to request bypass:', error );
        return false;
    }
}

async function handleBypassClick() {
    const bypassButton = document.getElementById( 'bypass-button' );
    const blockedUrl = getBlockedUrl();

    if ( !blockedUrl ) return;

    if ( bypassButton ) {
        bypassButton.disabled = true;
        bypassButton.textContent = 'Processing...';
    }

    const success = await requestBypass( blockedUrl );

    if ( success ) {
        window.location.href = blockedUrl;
        return;
    }

    if ( bypassButton ) bypassButton.disabled = false;
    await updateBypassButtonText();
    alert( 'Failed to grant bypass. Please try again.' );
}

function setupBypassButton() {
    const bypassButton = document.getElementById( 'bypass-button' );
    if ( bypassButton ) bypassButton.addEventListener( 'click', handleBypassClick );
}

document.addEventListener( 'DOMContentLoaded', () => {
    const blockedUrl = getBlockedUrl();
    displayBlockedMessage( blockedUrl );
    setupBypassButton();
    updateBypassButtonText();
} );

if ( typeof module !== 'undefined' && module.exports ) {
    module.exports = {
        getBlockedUrl,
        displayBlockedMessage,
        requestBypass,
        handleBypassClick,
        setupBypassButton,
        getBypassDuration,
        updateBypassButtonText,
        DEFAULT_BYPASS_DURATION
    };
}
