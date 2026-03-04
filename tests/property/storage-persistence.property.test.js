const {
    getBlockedUrls,
    saveBlockedUrls,
    resetBlockedUrlsCache,
    STORAGE_KEY
} = require( '../../src/service-worker' );
const { fc, validUrlPatternArbitrary, uniqueBlockedListArbitrary } = require( '../helpers/generators' );

describe( 'Feature: url-blocker, Property 3: Storage Persistence Round-Trip', () => {
    let mockStorageState = {};

    const uniqueUrlListArbitrary = uniqueBlockedListArbitrary();

    beforeEach( () => {
        resetBlockedUrlsCache();
        mockStorageState = {};

        chrome.storage.sync.set.mockImplementation( async ( data ) => {
            Object.assign( mockStorageState, data );
            return undefined;
        } );

        chrome.storage.sync.get.mockImplementation( async ( keys ) => {
            const result = {};
            for ( const key of keys ) {
                if ( key in mockStorageState ) {
                    result[ key ] = mockStorageState[ key ];
                }
            }
            return result;
        } );
    } );

    it( 'should persist and retrieve any URL list unchanged (round-trip)', async () => {
        await fc.assert(
            fc.asyncProperty( uniqueUrlListArbitrary, async ( urlList ) => {
                // Reset state for each iteration
                resetBlockedUrlsCache();
                mockStorageState = {};

                // Save the URL list to storage
                await saveBlockedUrls( urlList );

                // Retrieve the URL list from storage
                const retrievedUrls = await getBlockedUrls();

                // Verify the retrieved list equals the saved list
                expect( retrievedUrls ).toEqual( urlList );
            } ),
            { numRuns: 100 }
        );
    } );

    it( 'should persist additions to the URL list correctly', async () => {
        await fc.assert(
            fc.asyncProperty(
                uniqueUrlListArbitrary,
                validUrlPatternArbitrary,
                async ( initialList, newUrl ) => {
                    // Reset state for each iteration
                    resetBlockedUrlsCache();
                    mockStorageState = {};

                    // Skip if newUrl is already in the list (duplicate)
                    if ( initialList.includes( newUrl ) ) {
                        return true;
                    }

                    // Save initial list
                    await saveBlockedUrls( initialList );

                    // Add new URL to the list
                    const modifiedList = [ ...initialList, newUrl ];
                    await saveBlockedUrls( modifiedList );

                    // Retrieve and verify
                    const retrievedUrls = await getBlockedUrls();

                    expect( retrievedUrls ).toEqual( modifiedList );
                    expect( retrievedUrls ).toContain( newUrl );
                    expect( retrievedUrls.length ).toBe( initialList.length + 1 );
                }
            ),
            { numRuns: 100 }
        );
    } );

    it( 'should persist removals from the URL list correctly', async () => {
        await fc.assert(
            fc.asyncProperty(
                uniqueUrlListArbitrary.filter( list => list.length > 0 ),
                async ( urlList ) => {
                    // Reset state for each iteration
                    resetBlockedUrlsCache();
                    mockStorageState = {};

                    // Save initial list
                    await saveBlockedUrls( urlList );

                    // Pick a random URL to remove
                    const indexToRemove = Math.floor( Math.random() * urlList.length );
                    const urlToRemove = urlList[ indexToRemove ];
                    const modifiedList = urlList.filter( ( _, i ) => i !== indexToRemove );

                    // Save modified list
                    await saveBlockedUrls( modifiedList );

                    // Retrieve and verify
                    const retrievedUrls = await getBlockedUrls();

                    expect( retrievedUrls ).toEqual( modifiedList );
                    expect( retrievedUrls ).not.toContain( urlToRemove );
                    expect( retrievedUrls.length ).toBe( urlList.length - 1 );
                }
            ),
            { numRuns: 100 }
        );
    } );

    it( 'should handle multiple sequential modifications correctly', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.array( uniqueUrlListArbitrary, { minLength: 1, maxLength: 10 } ),
                async ( urlListSequence ) => {
                    // Reset state for each iteration
                    resetBlockedUrlsCache();
                    mockStorageState = {};

                    // Apply each modification in sequence
                    for ( const urlList of urlListSequence ) {
                        await saveBlockedUrls( urlList );

                        // Verify after each save
                        const retrievedUrls = await getBlockedUrls();
                        expect( retrievedUrls ).toEqual( urlList );
                    }

                    // Final verification - should have the last list
                    const finalUrls = await getBlockedUrls();
                    expect( finalUrls ).toEqual( urlListSequence[ urlListSequence.length - 1 ] );
                }
            ),
            { numRuns: 100 }
        );
    } );

    it( 'should handle empty list round-trip', async () => {
        await fc.assert(
            fc.asyncProperty(
                uniqueUrlListArbitrary,
                async ( initialList ) => {
                    // Reset state for each iteration
                    resetBlockedUrlsCache();
                    mockStorageState = {};

                    // Save initial list
                    await saveBlockedUrls( initialList );

                    // Clear the list
                    await saveBlockedUrls( [] );

                    // Retrieve and verify empty
                    const retrievedUrls = await getBlockedUrls();
                    expect( retrievedUrls ).toEqual( [] );
                }
            ),
            { numRuns: 100 }
        );
    } );
} );
