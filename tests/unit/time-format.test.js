const {
    formatDisplayTimestamp,
    formatAbsoluteDate,
    getOrdinalSuffix,
    padDatePart,
    getLocalTimestampPrefix,
    sanitizeFilenamePart,
    getScreenshotFilename
} = require( '../../src/utils/time-format' );

describe( 'Time Format Utilities', () => {
    describe( 'getOrdinalSuffix', () => {
        it( 'should return correct suffixes for common days', () => {
            expect( getOrdinalSuffix( 1 ) ).toBe( 'st' );
            expect( getOrdinalSuffix( 2 ) ).toBe( 'nd' );
            expect( getOrdinalSuffix( 3 ) ).toBe( 'rd' );
            expect( getOrdinalSuffix( 4 ) ).toBe( 'th' );
        } );

        it( 'should treat 11, 12, 13 as "th"', () => {
            expect( getOrdinalSuffix( 11 ) ).toBe( 'th' );
            expect( getOrdinalSuffix( 12 ) ).toBe( 'th' );
            expect( getOrdinalSuffix( 13 ) ).toBe( 'th' );
        } );
    } );

    describe( 'formatAbsoluteDate', () => {
        it( 'should format a date with month name and ordinal day', () => {
            expect( formatAbsoluteDate( new Date( 2026, 5, 25 ) ) ).toBe( 'Jun 25th 2026' );
        } );
    } );

    describe( 'formatDisplayTimestamp', () => {
        it( 'should handle missing and invalid timestamps', () => {
            expect( formatDisplayTimestamp( 0 ) ).toBe( 'Unknown' );
            expect( formatDisplayTimestamp( 'not-a-date' ) ).toBe( 'Unknown' );
        } );

        it( 'should format relative and absolute timestamps', () => {
            const now = new Date( 2026, 5, 7, 22, 31 ).getTime();
            expect( formatDisplayTimestamp( now - 30 * 1000, now ) ).toBe( 'just now' );
            expect( formatDisplayTimestamp( now - 90 * 1000, now ) ).toBe( '1m ago' );
            expect( formatDisplayTimestamp( now - 2 * 60 * 60 * 1000, now ) ).toBe( '2h ago' );
            expect( formatDisplayTimestamp( now - 3 * 24 * 60 * 60 * 1000, now ) ).toBe( '3d ago' );
            expect( formatDisplayTimestamp( new Date( 2025, 5, 25 ).getTime(), now ) ).toBe( 'Jun 25th 2025' );
        } );
    } );

    describe( 'padDatePart', () => {
        it( 'should left-pad single digits to two characters', () => {
            expect( padDatePart( 5 ) ).toBe( '05' );
            expect( padDatePart( 12 ) ).toBe( '12' );
        } );
    } );

    describe( 'getLocalTimestampPrefix', () => {
        it( 'should format morning times with AM and 12-hour clock', () => {
            expect( getLocalTimestampPrefix( new Date( 2026, 4, 25, 9, 5, 3 ) ) )
                .toBe( '2026-05-25 09.05.03 AM' );
        } );

        it( 'should format noon as 12 PM', () => {
            expect( getLocalTimestampPrefix( new Date( 2026, 4, 25, 12, 15, 9 ) ) )
                .toBe( '2026-05-25 12.15.09 PM' );
        } );

        it( 'should format midnight as 12 AM', () => {
            expect( getLocalTimestampPrefix( new Date( 2026, 4, 25, 0, 0, 0 ) ) )
                .toBe( '2026-05-25 12.00.00 AM' );
        } );

        it( 'should format afternoon times with PM and 12-hour clock', () => {
            expect( getLocalTimestampPrefix( new Date( 2026, 4, 25, 23, 26, 7 ) ) )
                .toBe( '2026-05-25 11.26.07 PM' );
        } );
    } );

    describe( 'sanitizeFilenamePart', () => {
        it( 'should replace illegal filename characters and collapse whitespace', () => {
            expect( sanitizeFilenamePart( 'Backup: Cluster/Prod?*' ) ).toBe( 'Backup Cluster Prod' );
        } );

        it( 'should fall back to a default for empty input', () => {
            expect( sanitizeFilenamePart( '' ) ).toBe( 'Untitled Page' );
            expect( sanitizeFilenamePart( '   ' ) ).toBe( 'Untitled Page' );
        } );
    } );

    describe( 'getScreenshotFilename', () => {
        const date = new Date( 2026, 4, 25, 11, 26, 7 );

        it( 'should include the timestamp prefix by default', () => {
            expect( getScreenshotFilename( 'Backup: Cluster/Prod?*', { date } ) )
                .toBe( '[2026-05-25 11.26.07 AM] Backup Cluster Prod.png' );
        } );

        it( 'should omit the timestamp when includeTimestamp is false', () => {
            expect( getScreenshotFilename( 'Backup: Cluster/Prod?*', { date, includeTimestamp: false } ) )
                .toBe( 'Backup Cluster Prod.png' );
        } );

        it( 'should append a suffix when provided', () => {
            expect( getScreenshotFilename( 'Library Capture', { date, suffix: 'original' } ) )
                .toBe( '[2026-05-25 11.26.07 AM] Library Capture - original.png' );
        } );
    } );
} );
