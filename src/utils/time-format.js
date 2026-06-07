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
        getOrdinalSuffix
    };

    root.InfinityGauntletTimeFormat = api;

    if ( typeof module !== 'undefined' && module.exports ) {
        module.exports = api;
    }
} )( typeof globalThis !== 'undefined' ? globalThis : window );
