const { getBlockedUrl, displayBlockedMessage } = require( '../../src/blocked' );

describe( 'Blocked Page Module', () => {
    // Store original window.location
    let originalLocation;

    beforeEach( () => {
        // Save original location
        originalLocation = window.location;

        // Clear document body
        document.body.innerHTML = '';

        // Create the blocked-url element that the blocked page uses
        const blockedUrlElement = document.createElement( 'p' );
        blockedUrlElement.id = 'blocked-url';
        blockedUrlElement.className = 'blocked-url';
        document.body.appendChild( blockedUrlElement );
    } );

    afterEach( () => {
        // Restore original location
        Object.defineProperty( window, 'location', {
            value: originalLocation,
            writable: true
        } );

        // Clean up DOM
        document.body.innerHTML = '';
    } );

    /**
     * Helper function to mock window.location.search
     * @param {string} search - The query string to set (including '?')
     */
    function mockLocationSearch( search ) {
        delete window.location;
        window.location = {
            ...originalLocation,
            search: search
        };
    }

    describe( 'URL Parameter Extraction (getBlockedUrl)', () => {
        it( 'should extract URL from query parameter', () => {
            mockLocationSearch( '?url=https://youtube.com' );

            const result = getBlockedUrl();

            expect( result ).toBe( 'https://youtube.com' );
        } );

        it( 'should return empty string when no URL parameter exists', () => {
            mockLocationSearch( '' );

            const result = getBlockedUrl();

            expect( result ).toBe( '' );
        } );

        it( 'should return empty string when query string is empty', () => {
            mockLocationSearch( '?' );

            const result = getBlockedUrl();

            expect( result ).toBe( '' );
        } );

        it( 'should return empty string when URL parameter is missing but other params exist', () => {
            mockLocationSearch( '?other=value&another=test' );

            const result = getBlockedUrl();

            expect( result ).toBe( '' );
        } );

        it( 'should handle URL-encoded URLs correctly', () => {
            mockLocationSearch( '?url=https%3A%2F%2Fyoutube.com%2Fshorts%2Fabc123' );

            const result = getBlockedUrl();

            expect( result ).toBe( 'https://youtube.com/shorts/abc123' );
        } );

        it( 'should handle URLs with special characters when properly encoded', () => {
            // When a URL contains & or other special chars, it should be URL-encoded
            mockLocationSearch( '?url=https%3A%2F%2Fexample.com%2Fpath%3Fquery%3Dvalue%26other%3Dtest' );

            const result = getBlockedUrl();

            expect( result ).toBe( 'https://example.com/path?query=value&other=test' );
        } );

        it( 'should handle unencoded URL with ampersand (truncates at &)', () => {
            // This tests the actual behavior when URL is not properly encoded
            // The & is interpreted as a parameter separator by URLSearchParams
            mockLocationSearch( '?url=https://example.com/path?query=value&other=test' );

            const result = getBlockedUrl();

            // URLSearchParams treats & as separator, so only gets value up to &
            expect( result ).toBe( 'https://example.com/path?query=value' );
        } );

        it( 'should handle URLs with unicode characters', () => {
            mockLocationSearch( '?url=https://example.com/%E4%B8%AD%E6%96%87' );

            const result = getBlockedUrl();

            expect( result ).toBe( 'https://example.com/中文' );
        } );

        it( 'should handle URLs with hash fragments', () => {
            mockLocationSearch( '?url=https://example.com/page%23section' );

            const result = getBlockedUrl();

            expect( result ).toBe( 'https://example.com/page#section' );
        } );

        it( 'should extract URL when multiple parameters exist', () => {
            mockLocationSearch( '?source=extension&url=https://blocked.com&timestamp=123' );

            const result = getBlockedUrl();

            expect( result ).toBe( 'https://blocked.com' );
        } );

        it( 'should handle empty URL parameter value', () => {
            mockLocationSearch( '?url=' );

            const result = getBlockedUrl();

            expect( result ).toBe( '' );
        } );

        it( 'should handle very long URLs', () => {
            const longPath = 'a'.repeat( 1000 );
            mockLocationSearch( `?url=https://example.com/${longPath}` );

            const result = getBlockedUrl();

            expect( result ).toBe( `https://example.com/${longPath}` );
        } );
    } );

    describe( 'Message Rendering (displayBlockedMessage)', () => {
        it( 'should display the blocked URL in the element', () => {
            displayBlockedMessage( 'https://youtube.com' );

            const element = document.getElementById( 'blocked-url' );
            expect( element.textContent ).toBe( 'https://youtube.com' );
        } );

        it( 'should display "Unknown URL" when URL is empty', () => {
            displayBlockedMessage( '' );

            const element = document.getElementById( 'blocked-url' );
            expect( element.textContent ).toBe( 'Unknown URL' );
        } );

        it( 'should display "Unknown URL" when URL is null', () => {
            displayBlockedMessage( null );

            const element = document.getElementById( 'blocked-url' );
            expect( element.textContent ).toBe( 'Unknown URL' );
        } );

        it( 'should display "Unknown URL" when URL is undefined', () => {
            displayBlockedMessage( undefined );

            const element = document.getElementById( 'blocked-url' );
            expect( element.textContent ).toBe( 'Unknown URL' );
        } );

        it( 'should display URL with special characters correctly', () => {
            displayBlockedMessage( 'https://example.com/path?query=value&other=test' );

            const element = document.getElementById( 'blocked-url' );
            expect( element.textContent ).toBe( 'https://example.com/path?query=value&other=test' );
        } );

        it( 'should display URL with unicode characters correctly', () => {
            displayBlockedMessage( 'https://example.com/中文/path' );

            const element = document.getElementById( 'blocked-url' );
            expect( element.textContent ).toBe( 'https://example.com/中文/path' );
        } );

        it( 'should handle very long URLs', () => {
            const longUrl = 'https://example.com/' + 'a'.repeat( 1000 );

            displayBlockedMessage( longUrl );

            const element = document.getElementById( 'blocked-url' );
            expect( element.textContent ).toBe( longUrl );
        } );

        it( 'should not throw when blocked-url element does not exist', () => {
            // Remove the element
            document.body.innerHTML = '';

            expect( () => {
                displayBlockedMessage( 'https://youtube.com' );
            } ).not.toThrow();
        } );

        it( 'should update existing content when called multiple times', () => {
            displayBlockedMessage( 'https://first.com' );
            displayBlockedMessage( 'https://second.com' );

            const element = document.getElementById( 'blocked-url' );
            expect( element.textContent ).toBe( 'https://second.com' );
        } );

        it( 'should escape HTML in URL to prevent XSS', () => {
            displayBlockedMessage( '<script>alert("xss")</script>' );

            const element = document.getElementById( 'blocked-url' );
            // textContent should escape HTML automatically
            expect( element.textContent ).toBe( '<script>alert("xss")</script>' );
            // Ensure no script tag was actually created
            expect( element.innerHTML ).not.toContain( '<script>' );
        } );
    } );

    describe( 'Integration: getBlockedUrl and displayBlockedMessage', () => {
        it( 'should correctly extract and display a blocked URL', () => {
            mockLocationSearch( '?url=https://youtube.com/shorts' );

            const url = getBlockedUrl();
            displayBlockedMessage( url );

            const element = document.getElementById( 'blocked-url' );
            expect( element.textContent ).toBe( 'https://youtube.com/shorts' );
        } );

        it( 'should handle missing URL parameter gracefully', () => {
            mockLocationSearch( '' );

            const url = getBlockedUrl();
            displayBlockedMessage( url );

            const element = document.getElementById( 'blocked-url' );
            expect( element.textContent ).toBe( 'Unknown URL' );
        } );

        it( 'should handle encoded URL parameter correctly', () => {
            mockLocationSearch( '?url=https%3A%2F%2Ftwitter.com%2Fhome' );

            const url = getBlockedUrl();
            displayBlockedMessage( url );

            const element = document.getElementById( 'blocked-url' );
            expect( element.textContent ).toBe( 'https://twitter.com/home' );
        } );
    } );
} );
