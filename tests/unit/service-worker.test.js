const {
    getBlockedUrls,
    saveBlockedUrls,
    handleMessage,
    initialize,
    buildScrollPositions,
    getScreenshotFilename
} = require( '../../src/service-worker' );
const {
    getTemporaryScreenshot
} = require( '../../src/screenshot-store' );

describe( 'Service Worker Module', () => {
    beforeEach( () => {
        jest.clearAllMocks();
        jest.spyOn( console, 'error' ).mockImplementation( () => { } );
    } );

    afterEach( () => {
        jest.restoreAllMocks();
    } );

    describe( 'Message Handler Responses', () => {
        describe( 'getBlockedUrls message', () => {
            it( 'should return success with URLs when storage has data', async () => {
                chrome.storage.sync.get.mockResolvedValue( {
                    blockedUrls: [ 'youtube.com', 'twitter.com' ]
                } );

                const response = await handleMessage( { type: 'getBlockedUrls' } );

                expect( response.success ).toBe( true );
                expect( response.urls ).toEqual( [ 'youtube.com', 'twitter.com' ] );
            } );

            it( 'should return success with empty array when storage is empty', async () => {
                chrome.storage.sync.get.mockResolvedValue( {} );

                const response = await handleMessage( { type: 'getBlockedUrls' } );

                expect( response.success ).toBe( true );
                expect( response.urls ).toEqual( [] );
            } );

            it( 'should call chrome.storage.sync.get with correct key', async () => {
                chrome.storage.sync.get.mockResolvedValue( { blockedUrls: [] } );

                await handleMessage( { type: 'getBlockedUrls' } );

                expect( chrome.storage.sync.get ).toHaveBeenCalledWith( [ 'blockedUrls' ] );
            } );
        } );

        describe( 'addUrl message', () => {
            it( 'should return success and updated list when adding valid URL', async () => {
                chrome.storage.sync.get.mockResolvedValue( { blockedUrls: [ 'youtube.com' ] } );
                chrome.storage.sync.set.mockResolvedValue( undefined );

                const response = await handleMessage( { type: 'addUrl', url: 'twitter.com' } );

                expect( response.success ).toBe( true );
                expect( response.urls ).toContain( 'youtube.com' );
                expect( response.urls ).toContain( 'twitter.com' );
            } );

            it( 'should return error for empty URL', async () => {
                const response = await handleMessage( { type: 'addUrl', url: '' } );

                expect( response.success ).toBe( false );
                expect( response.error ).toBe( 'Please enter a valid URL' );
            } );

            it( 'should return error for whitespace-only URL', async () => {
                const response = await handleMessage( { type: 'addUrl', url: '   ' } );

                expect( response.success ).toBe( false );
                expect( response.error ).toBe( 'Please enter a valid URL' );
            } );

            it( 'should return error for duplicate URL', async () => {
                chrome.storage.sync.get.mockResolvedValue( { blockedUrls: [ 'youtube.com' ] } );

                const response = await handleMessage( { type: 'addUrl', url: 'youtube.com' } );

                expect( response.success ).toBe( false );
                expect( response.error ).toBe( 'This URL is already blocked' );
            } );

            it( 'should return error for case-insensitive duplicate URL', async () => {
                chrome.storage.sync.get.mockResolvedValue( { blockedUrls: [ 'YouTube.com' ] } );

                const response = await handleMessage( { type: 'addUrl', url: 'youtube.com' } );

                expect( response.success ).toBe( false );
                expect( response.error ).toBe( 'This URL is already blocked' );
            } );

            it( 'should trim URL before adding', async () => {
                chrome.storage.sync.get.mockResolvedValue( { blockedUrls: [] } );
                chrome.storage.sync.set.mockResolvedValue( undefined );

                const response = await handleMessage( { type: 'addUrl', url: '  twitter.com  ' } );

                expect( response.success ).toBe( true );
                expect( response.urls ).toContain( 'twitter.com' );
            } );

            it( 'should save updated list to storage', async () => {
                chrome.storage.sync.get.mockResolvedValue( { blockedUrls: [ 'youtube.com' ] } );
                chrome.storage.sync.set.mockResolvedValue( undefined );

                await handleMessage( { type: 'addUrl', url: 'twitter.com' } );

                expect( chrome.storage.sync.set ).toHaveBeenCalledWith( {
                    blockedUrls: [ 'youtube.com', 'twitter.com' ]
                } );
            } );
        } );

        describe( 'removeUrl message', () => {
            it( 'should return success and updated list when removing URL', async () => {
                chrome.storage.sync.get.mockResolvedValue( {
                    blockedUrls: [ 'youtube.com', 'twitter.com' ]
                } );
                chrome.storage.sync.set.mockResolvedValue( undefined );

                const response = await handleMessage( { type: 'removeUrl', url: 'youtube.com' } );

                expect( response.success ).toBe( true );
                expect( response.urls ).not.toContain( 'youtube.com' );
                expect( response.urls ).toContain( 'twitter.com' );
            } );

            it( 'should remove URL case-insensitively', async () => {
                chrome.storage.sync.get.mockResolvedValue( {
                    blockedUrls: [ 'YouTube.com', 'twitter.com' ]
                } );
                chrome.storage.sync.set.mockResolvedValue( undefined );

                const response = await handleMessage( { type: 'removeUrl', url: 'youtube.com' } );

                expect( response.success ).toBe( true );
                expect( response.urls ).toEqual( [ 'twitter.com' ] );
            } );

            it( 'should handle removing URL with leading/trailing spaces', async () => {
                chrome.storage.sync.get.mockResolvedValue( {
                    blockedUrls: [ 'youtube.com', 'twitter.com' ]
                } );
                chrome.storage.sync.set.mockResolvedValue( undefined );

                const response = await handleMessage( { type: 'removeUrl', url: '  youtube.com  ' } );

                expect( response.success ).toBe( true );
                expect( response.urls ).not.toContain( 'youtube.com' );
            } );

            it( 'should save updated list to storage after removal', async () => {
                chrome.storage.sync.get.mockResolvedValue( {
                    blockedUrls: [ 'youtube.com', 'twitter.com' ]
                } );
                chrome.storage.sync.set.mockResolvedValue( undefined );

                await handleMessage( { type: 'removeUrl', url: 'youtube.com' } );

                expect( chrome.storage.sync.set ).toHaveBeenCalledWith( {
                    blockedUrls: [ 'twitter.com' ]
                } );
            } );

            it( 'should return empty list when removing last URL', async () => {
                chrome.storage.sync.get.mockResolvedValue( { blockedUrls: [ 'youtube.com' ] } );
                chrome.storage.sync.set.mockResolvedValue( undefined );

                const response = await handleMessage( { type: 'removeUrl', url: 'youtube.com' } );

                expect( response.success ).toBe( true );
                expect( response.urls ).toEqual( [] );
            } );

            it( 'should return error for invalid URL (non-string or empty)', async () => {
                expect( await handleMessage( { type: 'removeUrl', url: '' } ) )
                    .toEqual( { success: false, error: 'Please enter a valid URL' } );
                expect( await handleMessage( { type: 'removeUrl', url: null } ) )
                    .toEqual( { success: false, error: 'Please enter a valid URL' } );
                expect( await handleMessage( { type: 'removeUrl' } ) )
                    .toEqual( { success: false, error: 'Please enter a valid URL' } );
            } );
        } );

        describe( 'unknown message type', () => {
            it( 'should return error for unknown message type', async () => {
                const response = await handleMessage( { type: 'unknownType' } );

                expect( response.success ).toBe( false );
                expect( response.error ).toBe( 'Unknown message type: unknownType' );
            } );

            it( 'should return error for undefined message type', async () => {
                const response = await handleMessage( {} );

                expect( response.success ).toBe( false );
                expect( response.error ).toBe( 'Unknown message type: undefined' );
            } );
        } );

        describe( 'captureFullPageScreenshot message', () => {
            function mockScreenshotExecution( metricsOverride = {} ) {
                const metrics = {
                    scrollWidth: 800,
                    scrollHeight: 1000,
                    captureScrollHeight: 1000,
                    captureViewportHeight: 500,
                    scrollContainerTop: 0,
                    scrollContainerBottom: 500,
                    scrollContainerLeft: 0,
                    scrollContainerRight: 800,
                    viewportWidth: 800,
                    viewportHeight: 500,
                    scrollX: 0,
                    scrollY: 0,
                    devicePixelRatio: 1,
                    backgroundColor: 'rgb(17, 24, 39)',
                    usesElementScroll: false,
                    title: 'Test Page',
                    ...metricsOverride
                };

                chrome.tabs.query.mockResolvedValue( [
                    { id: 123, windowId: 456, index: 4, url: 'https://example.com/page' }
                ] );
                chrome.scripting.executeScript.mockImplementation( async ( { func, args = [] } ) => {
                    if ( func.name === 'getScreenshotPageMetrics' ) {
                        return [ { result: metrics } ];
                    }
                    if ( func.name === 'scrollPageForScreenshot' ) {
                        return [ {
                            result: {
                                scrollX: args[ 0 ] || 0,
                                scrollY: args[ 1 ] || 0
                            }
                        } ];
                    }
                    return [ { result: {} } ];
                } );
                chrome.tabs.captureVisibleTab.mockResolvedValue( 'data:image/png;base64,tile' );
                chrome.runtime.getContexts.mockResolvedValue( [] );
                chrome.offscreen.createDocument.mockResolvedValue( undefined );
                chrome.runtime.sendMessage.mockResolvedValue( {
                    success: true,
                    dataUrl: 'data:image/png;base64,stitched'
                } );
                chrome.tabs.create.mockResolvedValue( { id: 789 } );
            }

            it( 'should capture, stitch, store, and open screenshot review tab', async () => {
                mockScreenshotExecution();

                const response = await handleMessage( { type: 'captureFullPageScreenshot' } );

                expect( response ).toEqual( expect.objectContaining( {
                    success: true,
                    screenshotId: expect.any( String ),
                    reviewTabId: 789,
                    tileCount: 3
                } ) );
                expect( chrome.tabs.captureVisibleTab ).toHaveBeenCalledTimes( 3 );
                expect( chrome.runtime.sendMessage ).toHaveBeenCalledWith( {
                    type: 'stitchScreenshotTiles',
                    payload: expect.objectContaining( {
                        tiles: expect.any( Array ),
                        metrics: expect.objectContaining( {
                            scrollHeight: 1000,
                            backgroundColor: 'rgb(17, 24, 39)'
                        } )
                    } )
                } );
                expect( chrome.downloads.download ).not.toHaveBeenCalled();
                expect( chrome.tabs.create ).toHaveBeenCalledWith( expect.objectContaining( {
                    url: expect.stringContaining( `src/screenshot-review.html?id=${encodeURIComponent( response.screenshotId )}` ),
                    active: true,
                    windowId: 456,
                    index: 5
                } ) );

                await expect( getTemporaryScreenshot( response.screenshotId ) )
                    .resolves.toEqual( expect.objectContaining( {
                        dataUrl: 'data:image/png;base64,stitched',
                        title: 'Test Page'
                    } ) );
            } );

            it( 'should reject browser pages before capture', async () => {
                chrome.tabs.query.mockResolvedValue( [
                    { id: 123, windowId: 456, url: 'chrome://extensions' }
                ] );

                await expect( handleMessage( { type: 'captureFullPageScreenshot' } ) )
                    .rejects.toThrow( 'Cannot capture browser pages' );
                expect( chrome.tabs.captureVisibleTab ).not.toHaveBeenCalled();
            } );

            it( 'should build overlapping scroll positions for tall pages', () => {
                expect( buildScrollPositions( 1000, 500 ) ).toEqual( [ 0, 250, 500 ] );
            } );

            it( 'should build screenshot filenames with local timestamp prefix and sanitized title', () => {
                const filename = getScreenshotFilename(
                    'Backup: Cluster/Prod?*',
                    new Date( 2026, 4, 25, 11, 26, 7 )
                );

                expect( filename ).toBe( '[2026-05-25 11-26-07] Backup Cluster Prod.png' );
            } );

        } );
    } );

    describe( 'Storage Error Handling', () => {
        describe( 'getBlockedUrls storage errors', () => {
            it( 'should return cached data when storage.get fails', async () => {
                // First, populate the cache with a successful call
                chrome.storage.sync.get.mockResolvedValueOnce( {
                    blockedUrls: [ 'cached-url.com' ]
                } );
                await getBlockedUrls();

                // Now simulate a storage error
                chrome.storage.sync.get.mockRejectedValueOnce( new Error( 'Storage unavailable' ) );

                const result = await getBlockedUrls();

                expect( result ).toEqual( [ 'cached-url.com' ] );
            } );

            it( 'should log error when storage.get fails', async () => {
                chrome.storage.sync.get.mockRejectedValue( new Error( 'Storage unavailable' ) );

                await getBlockedUrls();

                expect( console.error ).toHaveBeenCalledWith(
                    'Service Worker: Error retrieving blocked URLs:',
                    expect.any( Error )
                );
            } );

            it( 'should return empty array when storage fails and cache is empty', async () => {
                // Clear any cached data by getting empty storage first
                chrome.storage.sync.get.mockResolvedValueOnce( { blockedUrls: [] } );
                await getBlockedUrls();

                // Now simulate a storage error
                chrome.storage.sync.get.mockRejectedValueOnce( new Error( 'Storage unavailable' ) );

                const result = await getBlockedUrls();

                expect( result ).toEqual( [] );
            } );
        } );

        describe( 'saveBlockedUrls storage errors', () => {
            it( 'should throw error when storage.set fails', async () => {
                chrome.storage.sync.set.mockRejectedValue( new Error( 'Storage full' ) );

                await expect( saveBlockedUrls( [ 'youtube.com' ] ) ).rejects.toThrow( 'Storage full' );
            } );

            it( 'should log error when storage.set fails', async () => {
                chrome.storage.sync.set.mockRejectedValue( new Error( 'Storage full' ) );

                try {
                    await saveBlockedUrls( [ 'youtube.com' ] );
                } catch ( e ) {
                    // Expected to throw
                }

                expect( console.error ).toHaveBeenCalledWith(
                    'Service Worker: Error saving blocked URLs:',
                    expect.any( Error )
                );
            } );

            it( 'should update cache even when storage.set fails', async () => {
                chrome.storage.sync.set.mockRejectedValue( new Error( 'Storage full' ) );

                try {
                    await saveBlockedUrls( [ 'new-url.com' ] );
                } catch ( e ) {
                    // Expected to throw
                }

                // Verify cache was updated by checking getBlockedUrls returns cached data
                chrome.storage.sync.get.mockRejectedValue( new Error( 'Storage unavailable' ) );
                const result = await getBlockedUrls();

                expect( result ).toEqual( [ 'new-url.com' ] );
            } );
        } );

        describe( 'handleMessage storage errors', () => {
            it( 'should throw error during addUrl when storage fails', async () => {
                chrome.storage.sync.get.mockResolvedValue( { blockedUrls: [] } );
                chrome.storage.sync.set.mockRejectedValue( new Error( 'Storage full' ) );

                // handleMessage throws the error, which is caught by the message listener
                await expect( handleMessage( { type: 'addUrl', url: 'youtube.com' } ) )
                    .rejects.toThrow( 'Storage full' );
            } );

            it( 'should throw error during removeUrl when storage fails', async () => {
                chrome.storage.sync.get.mockResolvedValue( { blockedUrls: [ 'youtube.com' ] } );
                chrome.storage.sync.set.mockRejectedValue( new Error( 'Storage full' ) );

                // handleMessage throws the error, which is caught by the message listener
                await expect( handleMessage( { type: 'removeUrl', url: 'youtube.com' } ) )
                    .rejects.toThrow( 'Storage full' );
            } );

            it( 'should handle storage error during getBlockedUrls message', async () => {
                // First populate cache
                chrome.storage.sync.get.mockResolvedValueOnce( { blockedUrls: [ 'cached.com' ] } );
                await getBlockedUrls();

                // Now fail storage
                chrome.storage.sync.get.mockRejectedValueOnce( new Error( 'Storage unavailable' ) );

                const response = await handleMessage( { type: 'getBlockedUrls' } );

                // Should still succeed with cached data
                expect( response.success ).toBe( true );
                expect( response.urls ).toEqual( [ 'cached.com' ] );
            } );
        } );
    } );

    describe( 'Initialization Behavior', () => {
        it( 'should load blocked URLs from storage on initialize', async () => {
            chrome.storage.sync.get.mockResolvedValue( {
                blockedUrls: [ 'youtube.com', 'twitter.com' ]
            } );

            await initialize();

            expect( chrome.storage.sync.get ).toHaveBeenCalledWith( [ 'blockedUrls' ] );
        } );

        it( 'should handle storage error during initialization gracefully', async () => {
            chrome.storage.sync.get.mockRejectedValue( new Error( 'Storage unavailable' ) );

            await initialize();

            // Error is logged by getBlockedUrls, not initialize
            expect( console.error ).toHaveBeenCalledWith(
                'Service Worker: Error retrieving blocked URLs:',
                expect.any( Error )
            );
        } );

        it( 'should not throw when initialization fails', async () => {
            chrome.storage.sync.get.mockRejectedValue( new Error( 'Storage unavailable' ) );

            await expect( initialize() ).resolves.not.toThrow();
        } );

        it( 'should populate cache after successful initialization', async () => {
            chrome.storage.sync.get.mockResolvedValueOnce( {
                blockedUrls: [ 'initialized-url.com' ]
            } );

            await initialize();

            // Simulate storage failure to verify cache was populated
            chrome.storage.sync.get.mockRejectedValueOnce( new Error( 'Storage unavailable' ) );
            const result = await getBlockedUrls();

            expect( result ).toEqual( [ 'initialized-url.com' ] );
        } );
    } );

} );
