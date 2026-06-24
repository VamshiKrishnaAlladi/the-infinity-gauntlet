( function( root ) {
    const MINUTE_MS = 60 * 1000;
    const HOUR_MS = 60 * MINUTE_MS;
    const DAY_MS = 24 * HOUR_MS;
    const RELATIVE_DATE_CUTOFF_MS = 7 * DAY_MS;
    const MONTH_NAMES = [ 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec' ];

    function getOrdinalSuffix( day ) {
        const remainder = day % 100;
        if ( remainder >= 11 && remainder <= 13 ) return 'th';

        switch ( day % 10 ) {
            case 1:
                return 'st';
            case 2:
                return 'nd';
            case 3:
                return 'rd';
            default:
                return 'th';
        }
    }

    function formatAbsoluteDate( date ) {
        return `${MONTH_NAMES[ date.getMonth() ]} ${date.getDate()}${getOrdinalSuffix( date.getDate() )} ${date.getFullYear()}`;
    }

    function padDatePart( value ) {
        return value.toString().padStart( 2, '0' );
    }

    function getLocalTimestampPrefix( date = new Date() ) {
        const period = date.getHours() < 12 ? 'AM' : 'PM';
        const hours = padDatePart( ( date.getHours() % 12 ) || 12 );
        const year = date.getFullYear();
        const month = padDatePart( date.getMonth() + 1 );
        const day = padDatePart( date.getDate() );
        const minutes = padDatePart( date.getMinutes() );
        const seconds = padDatePart( date.getSeconds() );

        return `${year}-${month}-${day} ${hours}.${minutes}.${seconds} ${period}`;
    }

    function sanitizeFilenamePart( value ) {
        return ( value || 'Untitled Page' )
            .replace( /[<>:"/\\|?*\u0000-\u001F]/g, ' ' )
            .replace( /\s+/g, ' ' )
            .trim()
            .slice( 0, 120 ) || 'Untitled Page';
    }

    function getScreenshotFilename( title, { date = new Date(), includeTimestamp = true, suffix = '' } = {} ) {
        const sanitizedTitle = sanitizeFilenamePart( title );
        const suffixPart = suffix ? ` - ${suffix}` : '';
        if ( !includeTimestamp ) return `${sanitizedTitle}${suffixPart}.png`;
        return `[${getLocalTimestampPrefix( date )}] ${sanitizedTitle}${suffixPart}.png`;
    }

    function formatDisplayTimestamp( timestamp, now = Date.now() ) {
        if ( !timestamp ) return 'Unknown';

        const date = new Date( timestamp );
        const time = date.getTime();
        if ( Number.isNaN( time ) ) return 'Unknown';

        const elapsed = Math.max( 0, now - time );
        if ( elapsed < MINUTE_MS ) return 'just now';
        if ( elapsed < HOUR_MS ) return `${Math.floor( elapsed / MINUTE_MS )}m ago`;
        if ( elapsed < DAY_MS ) return `${Math.floor( elapsed / HOUR_MS )}h ago`;
        if ( elapsed < RELATIVE_DATE_CUTOFF_MS ) return `${Math.floor( elapsed / DAY_MS )}d ago`;

        return formatAbsoluteDate( date );
    }

    const api = {
        formatDisplayTimestamp,
        formatAbsoluteDate,
        getOrdinalSuffix,
        padDatePart,
        getLocalTimestampPrefix,
        sanitizeFilenamePart,
        getScreenshotFilename
    };

    root.InfinityGauntletTimeFormat = api;

    if ( typeof module !== 'undefined' && module.exports ) {
        module.exports = api;
    }
} )( typeof globalThis !== 'undefined' ? globalThis : window );
