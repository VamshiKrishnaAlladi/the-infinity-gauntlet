const fc = require( 'fast-check' );
const {
    getBlockedUrls,
    saveBlockedUrls,
    resetBlockedUrlsCache,
    STORAGE_KEY
} = require( '../../src/service-worker' );

describe( 'Feature: url-blocker, Property 3: Storage Persistence Round-Trip', () => {
    let mockStorageState = {};

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

    const urlPatternArbitrary = fc.stringOf(
        fc.constantFrom(
            'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
            'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
            '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
            '.', '-', '/', ':'
        ),
        { minLength: 1, maxLength: 100 }
    ).filter( s => s.trim().length > 0 );

    const uniqueUrlListArbitrary = fc.uniqueArray( urlPatternArbitrary, {
        minLength: 0,
        maxLength: 50
    } );

    it( 'should persist and retrieve any URL list unchanged (round-trip)', async () => {
        await fc.assert(
            fc.asyncProperty( uniqueUrlListArbitrary, async ( urlList ) => {
                resetBlockedUrlsCache();
                mockStorageState = {};

                await saveBlockedUrls( urlList );
                const retrievedUrls = await getBlockedUrls();

                expect( retrievedUrls ).toEqual( urlList );
            } ),
            { numRuns: 100 }
        );
    } );

    it( 'should persist additions to the URL list correctly', async () => {
        await fc.assert(
            fc.asyncProperty(
                uniqueUrlListArbitrary,
                urlPatternArbitrary,
                async ( initialList, newUrl ) => {
                    resetBlockedUrlsCache();
                    mockStorageState = {};

                    if ( initialList.includes( newUrl ) ) {
                        return true;
                    }

                    await saveBlockedUrls( initialList );

                    const modifiedList = [ ...initialList, newUrl ];
                    await saveBlockedUrls( modifiedList );

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
                    resetBlockedUrlsCache();
                    mockStorageState = {};

                    await saveBlockedUrls( urlList );

                    const indexToRemove = Math.floor( Math.random() * urlList.length );
                    const urlToRemove = urlList[ indexToRemove ];
                    const modifiedList = urlList.filter( ( _, i ) => i !== indexToRemove );

                    await saveBlockedUrls( modifiedList );

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
                    resetBlockedUrlsCache();
                    mockStorageState = {};

                    for ( const urlList of urlListSequence ) {
                        await saveBlockedUrls( urlList );

                        const retrievedUrls = await getBlockedUrls();
                        expect( retrievedUrls ).toEqual( urlList );
                    }

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
                    resetBlockedUrlsCache();
                    mockStorageState = {};

                    await saveBlockedUrls( initialList );
                    await saveBlockedUrls( [] );

                    const retrievedUrls = await getBlockedUrls();
                    expect( retrievedUrls ).toEqual( [] );
                }
            ),
            { numRuns: 100 }
        );
    } );
} );
