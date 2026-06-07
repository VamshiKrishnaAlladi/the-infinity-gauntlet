const {
    __clearMemoryScreenshotLibrary,
    createScreenshotLibraryItem,
    deleteScreenshotLibraryItem,
    getScreenshotLibraryItem,
    getScreenshotLibraryUsage,
    listScreenshotLibraryItems,
    updateScreenshotLibraryItem
} = require( '../../src/screenshot-store' );

describe( 'Screenshot Store Library', () => {
    beforeEach( () => {
        __clearMemoryScreenshotLibrary();
    } );

    it( 'should create and read a persistent screenshot library item', async () => {
        const item = await createScreenshotLibraryItem( {
            id: 'shot-1',
            title: ' Test Page ',
            dataUrl: 'data:image/png;base64,test',
            edits: [
                {
                    id: 'edit-1',
                    kind: 'rect',
                    tool: 'redact',
                    mode: 'solid',
                    rect: { x: 1, y: 2, width: 3, height: 4 }
                }
            ],
            createdAt: 1000
        } );

        expect( item ).toEqual( expect.objectContaining( {
            id: 'shot-1',
            title: 'Test Page',
            createdAt: 1000,
            updatedAt: 1000,
            originalBlob: expect.any( Blob ),
            thumbnailBlob: expect.any( Blob ),
            totalBytes: expect.any( Number )
        } ) );

        await expect( getScreenshotLibraryItem( 'shot-1' ) ).resolves.toEqual( expect.objectContaining( {
            id: 'shot-1',
            edits: expect.arrayContaining( [
                expect.objectContaining( { id: 'edit-1' } )
            ] )
        } ) );
    } );

    it( 'should sort library items by most recently updated and filter by title', async () => {
        await createScreenshotLibraryItem( {
            id: 'older',
            title: 'Alpha',
            dataUrl: 'data:image/png;base64,older',
            createdAt: 1000,
            updatedAt: 1000
        } );
        await createScreenshotLibraryItem( {
            id: 'newer',
            title: 'Beta Capture',
            dataUrl: 'data:image/png;base64,newer',
            createdAt: 2000,
            updatedAt: 3000
        } );

        await expect( listScreenshotLibraryItems() )
            .resolves.toEqual( [
                expect.objectContaining( { id: 'newer' } ),
                expect.objectContaining( { id: 'older' } )
            ] );

        await expect( listScreenshotLibraryItems( { search: 'beta' } ) )
            .resolves.toEqual( [
                expect.objectContaining( { id: 'newer' } )
            ] );
    } );

    it( 'should update draft content, keep thumbnail-only updates out of updatedAt, and delete items', async () => {
        await createScreenshotLibraryItem( {
            id: 'shot-1',
            title: 'Before',
            dataUrl: 'data:image/png;base64,before',
            createdAt: 1000,
            updatedAt: 1000
        } );

        const updated = await updateScreenshotLibraryItem( 'shot-1', {
            title: 'After',
            edits: [ { id: 'edit-1', kind: 'pen', points: [ { x: 0, y: 0 }, { x: 1, y: 1 } ] } ],
            updatedAt: 2000
        } );

        expect( updated.title ).toBe( 'After' );
        expect( updated.updatedAt ).toBe( 2000 );

        const thumbnailOnly = await updateScreenshotLibraryItem( 'shot-1', {
            thumbnailBlob: new Blob( [ 'thumb' ], { type: 'image/png' } )
        } );

        expect( thumbnailOnly.updatedAt ).toBe( 2000 );

        await deleteScreenshotLibraryItem( 'shot-1' );
        await expect( getScreenshotLibraryItem( 'shot-1' ) ).resolves.toBeNull();
    } );

    it( 'should estimate library usage', async () => {
        await createScreenshotLibraryItem( {
            id: 'shot-1',
            title: 'Usage',
            dataUrl: 'data:image/png;base64,usage'
        } );

        await expect( getScreenshotLibraryUsage() ).resolves.toEqual( expect.objectContaining( {
            itemCount: 1,
            trackedBytes: expect.any( Number )
        } ) );
    } );
} );
