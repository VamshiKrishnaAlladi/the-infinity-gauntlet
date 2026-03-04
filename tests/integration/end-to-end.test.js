const { mockLocationSearch, setupBlockedUrlElement } = require( '../helpers/integration' );
const {
    handleMessage,
    isUrlBlocked,
    getBlockedUrls,
    initialize
} = require( '../../src/service-worker' );

const { getBlockedUrl, displayBlockedMessage } = require( '../../src/blocked' );

describe( 'End-to-End Integration Tests', () => {
    let originalLocation;

    beforeEach( () => {
        jest.clearAllMocks();
        jest.spyOn( console, 'error' ).mockImplementation( () => { } );
        jest.spyOn( console, 'log' ).mockImplementation( () => { } );
        originalLocation = window.location;
        document.body.innerHTML = '';
        setupBlockedUrlElement();
    } );

    afterEach( () => {
        jest.restoreAllMocks();
        Object.defineProperty( window, 'location', {
            value: originalLocation,
            writable: true
        } );
        document.body.innerHTML = '';
    } );

    describe( 'End-to-End Add Flow', () => {
        it( 'should block navigation after URL is added through popup', async () => {
            chrome.storage.sync.get.mockResolvedValue( { blockedUrls: [] } );
            chrome.storage.sync.set.mockResolvedValue( undefined );

            const addResponse = await handleMessage( { type: 'addUrl', url: 'youtube.com/shorts' } );

            expect( addResponse.success ).toBe( true );
            expect( addResponse.urls ).toContain( 'youtube.com/shorts' );
            expect( chrome.storage.sync.set ).toHaveBeenCalledWith( {
                blockedUrls: [ 'youtube.com/shorts' ]
            } );

            const blockedUrls = addResponse.urls;
            expect( isUrlBlocked( 'https://youtube.com/shorts/video123', blockedUrls ) ).toBe( true );
            expect( isUrlBlocked( 'https://www.youtube.com/shorts/abc', blockedUrls ) ).toBe( true );
        } );


        it( 'should complete full add flow with multiple URLs', async () => {
            chrome.storage.sync.set.mockResolvedValue( undefined );

            chrome.storage.sync.get.mockResolvedValueOnce( { blockedUrls: [] } );
            const add1 = await handleMessage( { type: 'addUrl', url: 'twitter.com' } );
            expect( add1.success ).toBe( true );

            chrome.storage.sync.get.mockResolvedValueOnce( { blockedUrls: [ 'twitter.com' ] } );
            const add2 = await handleMessage( { type: 'addUrl', url: 'facebook.com' } );
            expect( add2.success ).toBe( true );

            chrome.storage.sync.get.mockResolvedValueOnce( { blockedUrls: [ 'twitter.com', 'facebook.com' ] } );
            const add3 = await handleMessage( { type: 'addUrl', url: 'reddit.com' } );
            expect( add3.success ).toBe( true );

            const finalUrls = add3.urls;
            expect( isUrlBlocked( 'https://twitter.com/home', finalUrls ) ).toBe( true );
            expect( isUrlBlocked( 'https://facebook.com/feed', finalUrls ) ).toBe( true );
            expect( isUrlBlocked( 'https://reddit.com/r/all', finalUrls ) ).toBe( true );
            expect( isUrlBlocked( 'https://google.com', finalUrls ) ).toBe( false );
        } );

        it( 'should handle add flow with URL validation errors', async () => {
            chrome.storage.sync.get.mockResolvedValue( { blockedUrls: [ 'existing.com' ] } );

            const emptyResponse = await handleMessage( { type: 'addUrl', url: '   ' } );
            expect( emptyResponse.success ).toBe( false );
            expect( emptyResponse.error ).toBe( 'Please enter a valid URL' );

            const duplicateResponse = await handleMessage( { type: 'addUrl', url: 'existing.com' } );
            expect( duplicateResponse.success ).toBe( false );
            expect( duplicateResponse.error ).toBe( 'This URL is already blocked' );

            expect( chrome.storage.sync.set ).not.toHaveBeenCalled();
        } );

        it( 'should display blocked page correctly after URL is added', async () => {
            chrome.storage.sync.get.mockResolvedValue( { blockedUrls: [] } );
            chrome.storage.sync.set.mockResolvedValue( undefined );

            const addResponse = await handleMessage( { type: 'addUrl', url: 'instagram.com' } );
            expect( addResponse.success ).toBe( true );

            const blockedUrl = 'https://instagram.com/explore';
            mockLocationSearch( '?url=' + encodeURIComponent( blockedUrl ), originalLocation );

            const extractedUrl = getBlockedUrl();
            displayBlockedMessage( extractedUrl );

            const element = document.getElementById( 'blocked-url' );
            expect( element.textContent ).toBe( 'https://instagram.com/explore' );
        } );
    } );


    describe( 'End-to-End Remove Flow', () => {
        it( 'should allow navigation after URL is removed through popup', async () => {
            chrome.storage.sync.get.mockResolvedValue( { blockedUrls: [ 'youtube.com/shorts' ] } );
            chrome.storage.sync.set.mockResolvedValue( undefined );

            const initialUrls = ( await handleMessage( { type: 'getBlockedUrls' } ) ).urls;
            expect( isUrlBlocked( 'https://youtube.com/shorts/video', initialUrls ) ).toBe( true );

            chrome.storage.sync.get.mockResolvedValue( { blockedUrls: [ 'youtube.com/shorts' ] } );
            const removeResponse = await handleMessage( { type: 'removeUrl', url: 'youtube.com/shorts' } );

            expect( removeResponse.success ).toBe( true );
            expect( removeResponse.urls ).not.toContain( 'youtube.com/shorts' );
            expect( chrome.storage.sync.set ).toHaveBeenCalledWith( {
                blockedUrls: []
            } );

            const updatedUrls = removeResponse.urls;
            expect( isUrlBlocked( 'https://youtube.com/shorts/video123', updatedUrls ) ).toBe( false );
        } );

        it( 'should allow navigation to specific URL while keeping others blocked', async () => {
            chrome.storage.sync.get.mockResolvedValue( {
                blockedUrls: [ 'youtube.com', 'twitter.com', 'facebook.com' ]
            } );
            chrome.storage.sync.set.mockResolvedValue( undefined );

            const removeResponse = await handleMessage( { type: 'removeUrl', url: 'twitter.com' } );
            expect( removeResponse.success ).toBe( true );

            const updatedUrls = removeResponse.urls;
            expect( isUrlBlocked( 'https://twitter.com/home', updatedUrls ) ).toBe( false );
            expect( isUrlBlocked( 'https://youtube.com/watch', updatedUrls ) ).toBe( true );
            expect( isUrlBlocked( 'https://facebook.com/feed', updatedUrls ) ).toBe( true );
        } );

        it( 'should handle removing all URLs leaving empty list', async () => {
            chrome.storage.sync.set.mockResolvedValue( undefined );
            chrome.storage.sync.get.mockResolvedValueOnce( { blockedUrls: [ 'example.com' ] } );

            const removeResponse = await handleMessage( { type: 'removeUrl', url: 'example.com' } );

            expect( removeResponse.success ).toBe( true );
            expect( removeResponse.urls ).toEqual( [] );
            expect( isUrlBlocked( 'https://example.com', removeResponse.urls ) ).toBe( false );
        } );
    } );


    describe( 'Extension Lifecycle', () => {
        it( 'should persist URLs across service worker restart', async () => {
            chrome.storage.sync.get.mockResolvedValue( { blockedUrls: [] } );
            chrome.storage.sync.set.mockResolvedValue( undefined );

            chrome.storage.sync.get.mockResolvedValueOnce( { blockedUrls: [] } );
            await handleMessage( { type: 'addUrl', url: 'youtube.com' } );

            chrome.storage.sync.get.mockResolvedValueOnce( { blockedUrls: [ 'youtube.com' ] } );
            await handleMessage( { type: 'addUrl', url: 'twitter.com' } );

            expect( chrome.storage.sync.set ).toHaveBeenCalledWith( {
                blockedUrls: [ 'youtube.com' ]
            } );
            expect( chrome.storage.sync.set ).toHaveBeenCalledWith( {
                blockedUrls: [ 'youtube.com', 'twitter.com' ]
            } );

            chrome.storage.sync.get.mockResolvedValue( {
                blockedUrls: [ 'youtube.com', 'twitter.com' ]
            } );

            await initialize();

            const urls = await getBlockedUrls();
            expect( urls ).toContain( 'youtube.com' );
            expect( urls ).toContain( 'twitter.com' );
            expect( isUrlBlocked( 'https://youtube.com/video', urls ) ).toBe( true );
            expect( isUrlBlocked( 'https://twitter.com/home', urls ) ).toBe( true );
        } );

        it( 'should handle service worker restart with empty storage', async () => {
            chrome.storage.sync.get.mockResolvedValue( {} );

            await initialize();

            const urls = await getBlockedUrls();
            expect( urls ).toEqual( [] );
            expect( isUrlBlocked( 'https://youtube.com', urls ) ).toBe( false );
        } );

        it( 'should maintain URL list integrity through multiple restarts', async () => {
            chrome.storage.sync.set.mockResolvedValue( undefined );

            chrome.storage.sync.get.mockResolvedValueOnce( { blockedUrls: [] } );
            await handleMessage( { type: 'addUrl', url: 'site1.com' } );

            chrome.storage.sync.get.mockResolvedValueOnce( { blockedUrls: [ 'site1.com' ] } );
            await handleMessage( { type: 'addUrl', url: 'site2.com' } );

            chrome.storage.sync.get.mockResolvedValue( {
                blockedUrls: [ 'site1.com', 'site2.com' ]
            } );
            await initialize();

            let urls = await getBlockedUrls();
            expect( urls ).toHaveLength( 2 );

            chrome.storage.sync.get.mockResolvedValue( {
                blockedUrls: [ 'site1.com', 'site2.com' ]
            } );
            await handleMessage( { type: 'removeUrl', url: 'site1.com' } );

            chrome.storage.sync.get.mockResolvedValue( {
                blockedUrls: [ 'site2.com' ]
            } );
            await initialize();

            urls = await getBlockedUrls();
            expect( urls ).toHaveLength( 1 );
            expect( urls ).toContain( 'site2.com' );
            expect( urls ).not.toContain( 'site1.com' );
        } );

        it( 'should recover gracefully from storage errors during restart', async () => {
            chrome.storage.sync.get.mockRejectedValueOnce( new Error( 'Storage unavailable' ) );

            await expect( initialize() ).resolves.not.toThrow();
            expect( console.error ).toHaveBeenCalled();
        } );
    } );


    describe( 'Complete User Journey', () => {
        it( 'should handle complete user journey: install, add, block, remove, allow', async () => {
            chrome.storage.sync.set.mockResolvedValue( undefined );

            // Fresh install - initialize with empty storage
            chrome.storage.sync.get.mockResolvedValue( { blockedUrls: [] } );
            await initialize();

            // Get URLs should return empty after fresh install
            const initialUrls = await getBlockedUrls();
            expect( initialUrls ).toEqual( [] );

            // User adds a distracting site
            chrome.storage.sync.get.mockResolvedValueOnce( { blockedUrls: [] } );
            const addResponse = await handleMessage( { type: 'addUrl', url: 'youtube.com/shorts' } );
            expect( addResponse.success ).toBe( true );

            let urls = addResponse.urls;
            expect( isUrlBlocked( 'https://youtube.com/shorts/trending', urls ) ).toBe( true );

            mockLocationSearch( '?url=https%3A%2F%2Fyoutube.com%2Fshorts%2Ftrending', originalLocation );
            const blockedUrl = getBlockedUrl();
            displayBlockedMessage( blockedUrl );
            expect( document.getElementById( 'blocked-url' ).textContent ).toBe(
                'https://youtube.com/shorts/trending'
            );

            chrome.storage.sync.get.mockResolvedValueOnce( { blockedUrls: [ 'youtube.com/shorts' ] } );
            const removeResponse = await handleMessage( { type: 'removeUrl', url: 'youtube.com/shorts' } );
            expect( removeResponse.success ).toBe( true );

            urls = removeResponse.urls;
            expect( isUrlBlocked( 'https://youtube.com/shorts/trending', urls ) ).toBe( false );
        } );

        it( 'should handle user managing multiple sites over time', async () => {
            chrome.storage.sync.set.mockResolvedValue( undefined );

            chrome.storage.sync.get.mockResolvedValueOnce( { blockedUrls: [] } );
            await handleMessage( { type: 'addUrl', url: 'twitter.com' } );

            chrome.storage.sync.get.mockResolvedValueOnce( { blockedUrls: [ 'twitter.com' ] } );
            await handleMessage( { type: 'addUrl', url: 'facebook.com' } );

            chrome.storage.sync.get.mockResolvedValueOnce( { blockedUrls: [ 'twitter.com', 'facebook.com' ] } );
            const day1Response = await handleMessage( { type: 'addUrl', url: 'instagram.com' } );

            expect( day1Response.urls ).toHaveLength( 3 );

            chrome.storage.sync.get.mockResolvedValueOnce( {
                blockedUrls: [ 'twitter.com', 'facebook.com', 'instagram.com' ]
            } );
            const day2Response = await handleMessage( { type: 'removeUrl', url: 'twitter.com' } );

            expect( day2Response.urls ).toHaveLength( 2 );
            expect( isUrlBlocked( 'https://twitter.com', day2Response.urls ) ).toBe( false );
            expect( isUrlBlocked( 'https://facebook.com', day2Response.urls ) ).toBe( true );

            chrome.storage.sync.get.mockResolvedValueOnce( {
                blockedUrls: [ 'facebook.com', 'instagram.com' ]
            } );
            const day3Response = await handleMessage( { type: 'addUrl', url: 'reddit.com' } );

            expect( day3Response.urls ).toHaveLength( 3 );
            expect( isUrlBlocked( 'https://reddit.com/r/all', day3Response.urls ) ).toBe( true );
        } );
    } );


    describe( 'Edge Cases and Error Handling', () => {
        it( 'should handle storage errors during add operation', async () => {
            chrome.storage.sync.get.mockResolvedValue( { blockedUrls: [] } );
            chrome.storage.sync.set.mockRejectedValue( new Error( 'Storage quota exceeded' ) );

            await expect( handleMessage( { type: 'addUrl', url: 'test.com' } ) )
                .rejects.toThrow( 'Storage quota exceeded' );
        } );

        it( 'should handle storage errors during remove operation', async () => {
            chrome.storage.sync.get.mockResolvedValue( { blockedUrls: [ 'test.com' ] } );
            chrome.storage.sync.set.mockRejectedValue( new Error( 'Storage error' ) );

            await expect( handleMessage( { type: 'removeUrl', url: 'test.com' } ) )
                .rejects.toThrow( 'Storage error' );
        } );

        it( 'should handle case-insensitive URL matching in full flow', async () => {
            chrome.storage.sync.get.mockResolvedValue( { blockedUrls: [] } );
            chrome.storage.sync.set.mockResolvedValue( undefined );

            const addResponse = await handleMessage( { type: 'addUrl', url: 'YouTube.COM' } );
            expect( addResponse.success ).toBe( true );

            const urls = addResponse.urls;
            expect( isUrlBlocked( 'https://youtube.com/video', urls ) ).toBe( true );
            expect( isUrlBlocked( 'https://YOUTUBE.COM/video', urls ) ).toBe( true );
            expect( isUrlBlocked( 'https://YouTube.Com/video', urls ) ).toBe( true );
        } );

        it( 'should handle URLs with special characters in full flow', async () => {
            chrome.storage.sync.get.mockResolvedValue( { blockedUrls: [] } );
            chrome.storage.sync.set.mockResolvedValue( undefined );

            const addResponse = await handleMessage( { type: 'addUrl', url: 'example.com/path?query=value' } );
            expect( addResponse.success ).toBe( true );

            const encodedUrl = encodeURIComponent( 'https://example.com/path?query=value&other=test' );
            mockLocationSearch( '?url=' + encodedUrl, originalLocation );

            const blockedUrl = getBlockedUrl();
            displayBlockedMessage( blockedUrl );

            expect( document.getElementById( 'blocked-url' ).textContent ).toBe(
                'https://example.com/path?query=value&other=test'
            );
        } );
    } );
} );
