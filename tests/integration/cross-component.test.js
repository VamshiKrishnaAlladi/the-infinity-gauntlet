const { mockLocationSearch, setupBlockedUrlElement } = require( '../helpers/integration' );
const {
    handleMessage,
    isUrlBlocked
} = require( '../../src/service-worker' );

const { getBlockedUrl, displayBlockedMessage } = require( '../../src/blocked' );

describe( 'Cross-Component Communication', () => {
    beforeEach( () => {
        jest.clearAllMocks();
        // Reset console mocks
        jest.spyOn( console, 'error' ).mockImplementation( () => { } );
        jest.spyOn( console, 'log' ).mockImplementation( () => { } );
    } );

    afterEach( () => {
        jest.restoreAllMocks();
    } );

    describe( 'Popup to Service Worker Communication', () => {
        /**
         * Tests that popup can request blocked URLs from service worker
         * Requirement: 1.1 - Display current list of blocked URLs
         */
        describe( 'getBlockedUrls message', () => {
            it( 'should return blocked URLs when popup requests them', async () => {
                // Setup: Service worker has URLs in storage
                chrome.storage.sync.get.mockResolvedValue( {
                    blockedUrls: [ 'youtube.com', 'twitter.com', 'facebook.com' ]
                } );

                // Action: Popup sends getBlockedUrls message
                const response = await handleMessage( { type: 'getBlockedUrls' } );

                // Verify: Service worker responds with URLs
                expect( response.success ).toBe( true );
                expect( response.urls ).toEqual( [ 'youtube.com', 'twitter.com', 'facebook.com' ] );
            } );

            it( 'should return empty array when no URLs are blocked', async () => {
                chrome.storage.sync.get.mockResolvedValue( { blockedUrls: [] } );

                const response = await handleMessage( { type: 'getBlockedUrls' } );

                expect( response.success ).toBe( true );
                expect( response.urls ).toEqual( [] );
            } );

            it( 'should handle storage being uninitialized', async () => {
                chrome.storage.sync.get.mockResolvedValue( {} );

                const response = await handleMessage( { type: 'getBlockedUrls' } );

                expect( response.success ).toBe( true );
                expect( response.urls ).toEqual( [] );
            } );
        } );

        /**
         * Tests that popup can add URLs via service worker
         * Requirement: 2.1 - Add URL pattern to blocked list
         */
        describe( 'addUrl message', () => {
            it( 'should add URL when popup sends addUrl message', async () => {
                chrome.storage.sync.get.mockResolvedValue( { blockedUrls: [ 'youtube.com' ] } );
                chrome.storage.sync.set.mockResolvedValue( undefined );

                const response = await handleMessage( { type: 'addUrl', url: 'twitter.com' } );

                expect( response.success ).toBe( true );
                expect( response.urls ).toContain( 'youtube.com' );
                expect( response.urls ).toContain( 'twitter.com' );
                expect( chrome.storage.sync.set ).toHaveBeenCalledWith( {
                    blockedUrls: [ 'youtube.com', 'twitter.com' ]
                } );
            } );

            it( 'should add first URL to empty list', async () => {
                chrome.storage.sync.get.mockResolvedValue( { blockedUrls: [] } );
                chrome.storage.sync.set.mockResolvedValue( undefined );

                const response = await handleMessage( { type: 'addUrl', url: 'reddit.com' } );

                expect( response.success ).toBe( true );
                expect( response.urls ).toEqual( [ 'reddit.com' ] );
            } );

            it( 'should reject invalid URL and return error', async () => {
                const response = await handleMessage( { type: 'addUrl', url: '   ' } );

                expect( response.success ).toBe( false );
                expect( response.error ).toBe( 'Please enter a valid URL' );
                expect( chrome.storage.sync.set ).not.toHaveBeenCalled();
            } );

            it( 'should reject duplicate URL and return error', async () => {
                chrome.storage.sync.get.mockResolvedValue( { blockedUrls: [ 'youtube.com' ] } );

                const response = await handleMessage( { type: 'addUrl', url: 'youtube.com' } );

                expect( response.success ).toBe( false );
                expect( response.error ).toBe( 'This URL is already blocked' );
                expect( chrome.storage.sync.set ).not.toHaveBeenCalled();
            } );
        } );

        /**
         * Tests that popup can remove URLs via service worker
         * Requirement: 3.1 - Remove URL pattern from blocked list
         */
        describe( 'removeUrl message', () => {
            it( 'should remove URL when popup sends removeUrl message', async () => {
                chrome.storage.sync.get.mockResolvedValue( {
                    blockedUrls: [ 'youtube.com', 'twitter.com', 'facebook.com' ]
                } );
                chrome.storage.sync.set.mockResolvedValue( undefined );

                const response = await handleMessage( { type: 'removeUrl', url: 'twitter.com' } );

                expect( response.success ).toBe( true );
                expect( response.urls ).toEqual( [ 'youtube.com', 'facebook.com' ] );
                expect( chrome.storage.sync.set ).toHaveBeenCalledWith( {
                    blockedUrls: [ 'youtube.com', 'facebook.com' ]
                } );
            } );

            it( 'should remove last URL leaving empty list', async () => {
                chrome.storage.sync.get.mockResolvedValue( { blockedUrls: [ 'youtube.com' ] } );
                chrome.storage.sync.set.mockResolvedValue( undefined );

                const response = await handleMessage( { type: 'removeUrl', url: 'youtube.com' } );

                expect( response.success ).toBe( true );
                expect( response.urls ).toEqual( [] );
            } );

            it( 'should handle removing non-existent URL gracefully', async () => {
                chrome.storage.sync.get.mockResolvedValue( { blockedUrls: [ 'youtube.com' ] } );
                chrome.storage.sync.set.mockResolvedValue( undefined );

                const response = await handleMessage( { type: 'removeUrl', url: 'nonexistent.com' } );

                expect( response.success ).toBe( true );
                expect( response.urls ).toEqual( [ 'youtube.com' ] );
            } );
        } );

        /**
         * Tests the complete add-then-remove flow
         */
        describe( 'Add and Remove Flow', () => {
            it( 'should support complete add-then-remove workflow', async () => {
                // Start with empty list
                chrome.storage.sync.get.mockResolvedValueOnce( { blockedUrls: [] } );
                chrome.storage.sync.set.mockResolvedValue( undefined );

                // Add a URL
                const addResponse = await handleMessage( { type: 'addUrl', url: 'example.com' } );
                expect( addResponse.success ).toBe( true );
                expect( addResponse.urls ).toContain( 'example.com' );

                // Mock storage to return the updated list
                chrome.storage.sync.get.mockResolvedValueOnce( { blockedUrls: [ 'example.com' ] } );

                // Remove the URL
                const removeResponse = await handleMessage( { type: 'removeUrl', url: 'example.com' } );
                expect( removeResponse.success ).toBe( true );
                expect( removeResponse.urls ).not.toContain( 'example.com' );
            } );
        } );
    } );


    describe( 'Service Worker to Blocked Page Redirect', () => {
        /**
         * Tests that service worker correctly identifies URLs to block
         * Requirement: 4.3 - Redirect to blocked page when URL matches
         */
        describe( 'URL Blocking Detection', () => {
            it( 'should detect when URL matches blocked pattern', () => {
                const blockedUrls = [ 'youtube.com/shorts', 'twitter.com' ];

                expect( isUrlBlocked( 'https://youtube.com/shorts/abc123', blockedUrls ) ).toBe( true );
                expect( isUrlBlocked( 'https://twitter.com/home', blockedUrls ) ).toBe( true );
            } );

            it( 'should not block URLs that do not match any pattern', () => {
                const blockedUrls = [ 'youtube.com/shorts', 'twitter.com' ];

                expect( isUrlBlocked( 'https://youtube.com/watch?v=abc', blockedUrls ) ).toBe( false );
                expect( isUrlBlocked( 'https://facebook.com', blockedUrls ) ).toBe( false );
            } );

            it( 'should perform case-insensitive matching', () => {
                const blockedUrls = [ 'YouTube.com' ];

                expect( isUrlBlocked( 'https://youtube.com/video', blockedUrls ) ).toBe( true );
                expect( isUrlBlocked( 'https://YOUTUBE.COM/video', blockedUrls ) ).toBe( true );
            } );
        } );

        /**
         * Tests the redirect URL construction
         * Requirement: 4.3 - Redirect to blocked page with URL parameter
         */
        describe( 'Redirect URL Construction', () => {
            it( 'should construct correct redirect URL with encoded parameter', () => {
                const blockedPageUrl = 'chrome-extension://abc123/src/blocked.html';
                const targetUrl = 'https://youtube.com/shorts/video123';

                const redirectUrl = `${blockedPageUrl}?url=${encodeURIComponent( targetUrl )}`;

                expect( redirectUrl ).toBe(
                    'chrome-extension://abc123/src/blocked.html?url=https%3A%2F%2Fyoutube.com%2Fshorts%2Fvideo123'
                );
            } );

            it( 'should handle URLs with special characters', () => {
                const blockedPageUrl = 'chrome-extension://abc123/src/blocked.html';
                const targetUrl = 'https://example.com/path?query=value&other=test';

                const redirectUrl = `${blockedPageUrl}?url=${encodeURIComponent( targetUrl )}`;

                // Verify the URL is properly encoded
                expect( redirectUrl ).toContain( 'url=https%3A%2F%2Fexample.com' );
                expect( redirectUrl ).toContain( '%3Fquery%3Dvalue%26other%3Dtest' );
            } );
        } );
    } );

    describe( 'Blocked Page URL Parameter Handling', () => {
        let originalLocation;

        beforeEach( () => {
            originalLocation = window.location;
            document.body.innerHTML = '';
            setupBlockedUrlElement();
        } );

        afterEach( () => {
            Object.defineProperty( window, 'location', {
                value: originalLocation,
                writable: true
            } );
            document.body.innerHTML = '';
        } );

        /**
         * Tests that blocked page correctly extracts URL from query parameter
         * Requirement: 4.3 - Blocked page receives URL parameter correctly
         */
        describe( 'URL Parameter Extraction', () => {
            it( 'should extract simple URL from query parameter', () => {
                mockLocationSearch( '?url=https://youtube.com', originalLocation );

                const result = getBlockedUrl();

                expect( result ).toBe( 'https://youtube.com' );
            } );

            it( 'should decode URL-encoded parameter', () => {
                mockLocationSearch( '?url=https%3A%2F%2Fyoutube.com%2Fshorts%2Fabc123', originalLocation );

                const result = getBlockedUrl();

                expect( result ).toBe( 'https://youtube.com/shorts/abc123' );
            } );

            it( 'should handle URL with query parameters', () => {
                mockLocationSearch( '?url=https%3A%2F%2Fexample.com%2Fpath%3Fquery%3Dvalue', originalLocation );

                const result = getBlockedUrl();

                expect( result ).toBe( 'https://example.com/path?query=value' );
            } );

            it( 'should return empty string when URL parameter is missing', () => {
                mockLocationSearch( '', originalLocation );

                const result = getBlockedUrl();

                expect( result ).toBe( '' );
            } );
        } );

        /**
         * Tests that blocked page displays the URL correctly
         */
        describe( 'URL Display', () => {
            it( 'should display the blocked URL in the page', () => {
                displayBlockedMessage( 'https://youtube.com/shorts' );

                const element = document.getElementById( 'blocked-url' );
                expect( element.textContent ).toBe( 'https://youtube.com/shorts' );
            } );

            it( 'should display "Unknown URL" when URL is empty', () => {
                displayBlockedMessage( '' );

                const element = document.getElementById( 'blocked-url' );
                expect( element.textContent ).toBe( 'Unknown URL' );
            } );

            it( 'should handle URLs with special characters safely', () => {
                displayBlockedMessage( 'https://example.com/path?a=1&b=2' );

                const element = document.getElementById( 'blocked-url' );
                expect( element.textContent ).toBe( 'https://example.com/path?a=1&b=2' );
            } );
        } );

        /**
         * Tests the complete flow: extract URL and display it
         */
        describe( 'Extract and Display Flow', () => {
            it( 'should correctly extract and display blocked URL', () => {
                mockLocationSearch( '?url=https%3A%2F%2Ftwitter.com%2Fhome', originalLocation );

                const url = getBlockedUrl();
                displayBlockedMessage( url );

                const element = document.getElementById( 'blocked-url' );
                expect( element.textContent ).toBe( 'https://twitter.com/home' );
            } );

            it( 'should handle missing URL parameter gracefully', () => {
                mockLocationSearch( '?other=value', originalLocation );

                const url = getBlockedUrl();
                displayBlockedMessage( url );

                const element = document.getElementById( 'blocked-url' );
                expect( element.textContent ).toBe( 'Unknown URL' );
            } );
        } );
    } );


    describe( 'End-to-End Communication Flow', () => {
        /**
         * Tests the complete flow from adding a URL to it being blocked
         */
        describe( 'Add URL then Block Navigation Flow', () => {
            it( 'should block navigation after URL is added via popup', async () => {
                // Step 1: Popup adds a URL
                chrome.storage.sync.get.mockResolvedValue( { blockedUrls: [] } );
                chrome.storage.sync.set.mockResolvedValue( undefined );

                const addResponse = await handleMessage( { type: 'addUrl', url: 'youtube.com/shorts' } );
                expect( addResponse.success ).toBe( true );

                // Step 2: Service worker should now block matching URLs
                const blockedUrls = addResponse.urls;
                expect( isUrlBlocked( 'https://youtube.com/shorts/video123', blockedUrls ) ).toBe( true );
                expect( isUrlBlocked( 'https://youtube.com/watch?v=abc', blockedUrls ) ).toBe( false );
            } );
        } );

        /**
         * Tests the complete flow from removing a URL to it being allowed
         */
        describe( 'Remove URL then Allow Navigation Flow', () => {
            it( 'should allow navigation after URL is removed via popup', async () => {
                // Step 1: Start with a blocked URL
                chrome.storage.sync.get.mockResolvedValue( { blockedUrls: [ 'youtube.com/shorts' ] } );
                chrome.storage.sync.set.mockResolvedValue( undefined );

                // Verify it is blocked initially
                const initialUrls = ( await handleMessage( { type: 'getBlockedUrls' } ) ).urls;
                expect( isUrlBlocked( 'https://youtube.com/shorts/video', initialUrls ) ).toBe( true );

                // Step 2: Remove the URL via popup
                chrome.storage.sync.get.mockResolvedValue( { blockedUrls: [ 'youtube.com/shorts' ] } );
                const removeResponse = await handleMessage( { type: 'removeUrl', url: 'youtube.com/shorts' } );
                expect( removeResponse.success ).toBe( true );

                // Step 3: Verify navigation is now allowed
                const updatedUrls = removeResponse.urls;
                expect( isUrlBlocked( 'https://youtube.com/shorts/video', updatedUrls ) ).toBe( false );
            } );
        } );

        /**
         * Tests multiple operations in sequence
         */
        describe( 'Multiple Operations Sequence', () => {
            it( 'should handle multiple add and remove operations correctly', async () => {
                chrome.storage.sync.set.mockResolvedValue( undefined );

                // Add first URL
                chrome.storage.sync.get.mockResolvedValueOnce( { blockedUrls: [] } );
                const add1 = await handleMessage( { type: 'addUrl', url: 'youtube.com' } );
                expect( add1.urls ).toEqual( [ 'youtube.com' ] );

                // Add second URL
                chrome.storage.sync.get.mockResolvedValueOnce( { blockedUrls: [ 'youtube.com' ] } );
                const add2 = await handleMessage( { type: 'addUrl', url: 'twitter.com' } );
                expect( add2.urls ).toEqual( [ 'youtube.com', 'twitter.com' ] );

                // Remove first URL
                chrome.storage.sync.get.mockResolvedValueOnce( { blockedUrls: [ 'youtube.com', 'twitter.com' ] } );
                const remove1 = await handleMessage( { type: 'removeUrl', url: 'youtube.com' } );
                expect( remove1.urls ).toEqual( [ 'twitter.com' ] );

                // Verify blocking state
                expect( isUrlBlocked( 'https://youtube.com/video', remove1.urls ) ).toBe( false );
                expect( isUrlBlocked( 'https://twitter.com/home', remove1.urls ) ).toBe( true );
            } );
        } );
    } );
} );
