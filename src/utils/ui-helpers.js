( function() {
    function formatDuration( seconds ) {
        if ( seconds < 60 ) return `${seconds} second${seconds !== 1 ? 's' : ''}`;
        const minutes = Math.floor( seconds / 60 );
        const remainingSeconds = seconds % 60;
        if ( remainingSeconds === 0 ) return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
        return `${minutes} min ${remainingSeconds} sec`;
    }

    async function sendMessageWithRetry( message, retries = 3 ) {
        for ( let attempt = 0; ; attempt++ ) {
            try {
                return await chrome.runtime.sendMessage( message );
            } catch ( error ) {
                const canRetry = attempt < retries && error?.message?.includes( 'Could not establish connection' );
                if ( !canRetry ) throw error;
                await new Promise( resolve => setTimeout( resolve, 100 ) );
            }
        }
    }

    window.URLBlockerUI = {
        formatDuration,
        sendMessageWithRetry
    };

    if ( typeof module !== 'undefined' && module.exports ) {
        module.exports = {
            formatDuration,
            sendMessageWithRetry
        };
    }
} )();
