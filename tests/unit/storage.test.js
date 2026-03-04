const {
    getBlockedUrls,
    saveBlockedUrls,
    getBlockedUrlsCache,
    resetBlockedUrlsCache,
    STORAGE_KEY
} = require( '../../src/service-worker' );

describe( 'Storage (service-worker)', () => {
    beforeEach( () => {
        resetBlockedUrlsCache();
        jest.clearAllMocks();
    } );

    describe( 'getBlockedUrls', () => {
        it( 'should return empty array when no URLs are stored', async () => {
            chrome.storage.sync.get.mockResolvedValue( {} );

            const result = await getBlockedUrls();

            expect( result ).toEqual( [] );
            expect( chrome.storage.sync.get ).toHaveBeenCalledWith( [ STORAGE_KEY ] );
        } );

        it( 'should return stored URLs from chrome.storage.sync', async () => {
            const storedUrls = [ 'youtube.com/shorts', 'twitter.com', 'reddit.com/r/all' ];
            chrome.storage.sync.get.mockResolvedValue( { [ STORAGE_KEY ]: storedUrls } );

            const result = await getBlockedUrls();

            expect( result ).toEqual( storedUrls );
            expect( chrome.storage.sync.get ).toHaveBeenCalledWith( [ STORAGE_KEY ] );
        } );

        it( 'should update in-memory state on successful retrieval', async () => {
            const storedUrls = [ 'example.com', 'test.com' ];
            chrome.storage.sync.get.mockResolvedValue( { [ STORAGE_KEY ]: storedUrls } );

            await getBlockedUrls();

            expect( getBlockedUrlsCache() ).toEqual( storedUrls );
        } );

        it( 'should return in-memory fallback when storage fails', async () => {
            // First, populate in-memory state
            const fallbackUrls = [ 'fallback.com' ];
            chrome.storage.sync.get.mockResolvedValue( { [ STORAGE_KEY ]: fallbackUrls } );
            await getBlockedUrls();

            // Now simulate storage failure
            chrome.storage.sync.get.mockRejectedValue( new Error( 'Storage unavailable' ) );

            const result = await getBlockedUrls();

            expect( result ).toEqual( fallbackUrls );
        } );

        it( 'should log error to console when storage fails', async () => {
            const consoleSpy = jest.spyOn( console, 'error' ).mockImplementation();
            const error = new Error( 'Storage unavailable' );
            chrome.storage.sync.get.mockRejectedValue( error );

            await getBlockedUrls();

            expect( consoleSpy ).toHaveBeenCalledWith(
                'Service Worker: Error retrieving blocked URLs:',
                error
            );
            consoleSpy.mockRestore();
        } );
    } );

    describe( 'saveBlockedUrls', () => {
        it( 'should save URLs to chrome.storage.sync', async () => {
            const urlsToSave = [ 'youtube.com', 'facebook.com' ];
            chrome.storage.sync.set.mockResolvedValue( undefined );

            await saveBlockedUrls( urlsToSave );

            expect( chrome.storage.sync.set ).toHaveBeenCalledWith( {
                [ STORAGE_KEY ]: urlsToSave
            } );
        } );

        it( 'should update in-memory state when saving', async () => {
            const urlsToSave = [ 'newsite.com', 'another.com' ];
            chrome.storage.sync.set.mockResolvedValue( undefined );

            await saveBlockedUrls( urlsToSave );

            expect( getBlockedUrlsCache() ).toEqual( urlsToSave );
        } );

        it( 'should update in-memory state even when storage fails', async () => {
            const urlsToSave = [ 'site.com' ];
            chrome.storage.sync.set.mockRejectedValue( new Error( 'Storage full' ) );

            try {
                await saveBlockedUrls( urlsToSave );
            } catch ( e ) {
                // Expected to throw
            }

            expect( getBlockedUrlsCache() ).toEqual( urlsToSave );
        } );

        it( 'should throw error when storage fails', async () => {
            const error = new Error( 'Storage full' );
            chrome.storage.sync.set.mockRejectedValue( error );

            await expect( saveBlockedUrls( [ 'test.com' ] ) ).rejects.toThrow( 'Storage full' );
        } );

        it( 'should log error to console when storage fails', async () => {
            const consoleSpy = jest.spyOn( console, 'error' ).mockImplementation();
            const error = new Error( 'Storage full' );
            chrome.storage.sync.set.mockRejectedValue( error );

            try {
                await saveBlockedUrls( [ 'test.com' ] );
            } catch ( e ) {
                // Expected to throw
            }

            expect( consoleSpy ).toHaveBeenCalledWith(
                'Service Worker: Error saving blocked URLs:',
                error
            );
            consoleSpy.mockRestore();
        } );

        it( 'should save empty array successfully', async () => {
            chrome.storage.sync.set.mockResolvedValue( undefined );

            await saveBlockedUrls( [] );

            expect( chrome.storage.sync.set ).toHaveBeenCalledWith( {
                [ STORAGE_KEY ]: []
            } );
            expect( getBlockedUrlsCache() ).toEqual( [] );
        } );
    } );

    describe( 'STORAGE_KEY', () => {
        it( 'should be "blockedUrls"', () => {
            expect( STORAGE_KEY ).toBe( 'blockedUrls' );
        } );
    } );

    describe( 'getBlockedUrlsCache', () => {
        it( 'should return a copy of in-memory state', async () => {
            const urls = [ 'test.com' ];
            chrome.storage.sync.set.mockResolvedValue( undefined );
            await saveBlockedUrls( urls );

            const state = getBlockedUrlsCache();
            state.push( 'modified.com' );

            expect( getBlockedUrlsCache() ).toEqual( urls );
        } );
    } );

    describe( 'resetBlockedUrlsCache', () => {
        it( 'should clear in-memory state', async () => {
            const urls = [ 'test.com' ];
            chrome.storage.sync.set.mockResolvedValue( undefined );
            await saveBlockedUrls( urls );

            resetBlockedUrlsCache();

            expect( getBlockedUrlsCache() ).toEqual( [] );
        } );
    } );
} );
