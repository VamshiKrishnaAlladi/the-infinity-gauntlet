const {
    deleteItem,
    exportOriginal,
    formatBytes,
    loadLibrary,
    openItem,
    sanitizeFilenamePart
} = require( '../../src/screenshot-library' );

describe( 'Screenshot Library Page', () => {
    const item = {
        id: 'shot-1',
        title: 'Library Capture',
        createdAt: 1000,
        updatedAt: 2000,
        originalBlob: new Blob( [ 'original' ], { type: 'image/png' } ),
        thumbnailBlob: new Blob( [ 'thumbnail' ], { type: 'image/png' } ),
        edits: [],
        totalBytes: 32
    };

    beforeEach( () => {
        document.body.innerHTML = `
            <input id="search-input" value="">
            <p id="usage-summary"></p>
            <section id="library-grid"></section>
            <p id="empty-state" class="empty-state hidden"></p>
            <p id="status-message"></p>
        `;
        global.URL.createObjectURL = jest.fn( () => 'blob:library-item' );
        global.URL.revokeObjectURL = jest.fn();
        global.InfinityGauntletScreenshotStore = {
            listScreenshotLibraryItems: jest.fn().mockResolvedValue( [ item ] ),
            getScreenshotLibraryUsage: jest.fn().mockResolvedValue( {
                itemCount: 1,
                trackedBytes: 32,
                usage: 64,
                quota: 128
            } ),
            getScreenshotLibraryItem: jest.fn().mockResolvedValue( item ),
            deleteScreenshotLibraryItem: jest.fn().mockResolvedValue( undefined )
        };
        window.confirm = jest.fn();
        chrome.downloads.download.mockResolvedValue( 1 );
    } );

    afterEach( () => {
        document.body.innerHTML = '';
    } );

    it( 'should format bytes and sanitize filenames', () => {
        expect( formatBytes( 1536 ) ).toBe( '1.5 KB' );
        expect( sanitizeFilenamePart( 'A/B:C?' ) ).toBe( 'A B C' );
    } );

    it( 'should render cards and usage for the current title search', async () => {
        document.getElementById( 'search-input' ).value = 'library';

        await loadLibrary();

        expect( global.InfinityGauntletScreenshotStore.listScreenshotLibraryItems )
            .toHaveBeenCalledWith( { search: 'library' } );
        expect( document.querySelector( '.library-title' ).textContent ).toBe( 'Library Capture' );
        expect( document.getElementById( 'usage-summary' ).textContent )
            .toContain( '1 item, 32 B tracked' );
    } );

    it( 'should open review items in a new tab', () => {
        openItem( 'shot-1' );

        expect( chrome.tabs.create ).toHaveBeenCalledWith( {
            url: 'chrome-extension://test/src/screenshot-review.html?id=shot-1'
        } );
    } );

    it( 'should open review items when clicking the thumbnail', async () => {
        await loadLibrary();

        document.querySelector( '.library-thumbnail-wrap' ).click();

        expect( chrome.tabs.create ).toHaveBeenCalledWith( {
            url: 'chrome-extension://test/src/screenshot-review.html?id=shot-1'
        } );
    } );

    it( 'should require confirmation before exporting originals', async () => {
        window.confirm.mockReturnValueOnce( false );

        await exportOriginal( 'shot-1' );

        expect( chrome.downloads.download ).not.toHaveBeenCalled();

        window.confirm.mockReturnValueOnce( true );

        await exportOriginal( 'shot-1' );

        expect( chrome.downloads.download ).toHaveBeenCalledWith( expect.objectContaining( {
            url: 'blob:library-item',
            filename: expect.stringContaining( 'Library Capture - original.png' )
        } ) );
    } );

    it( 'should require confirmation before deleting items', async () => {
        window.confirm.mockReturnValueOnce( false );

        await deleteItem( 'shot-1' );

        expect( global.InfinityGauntletScreenshotStore.deleteScreenshotLibraryItem ).not.toHaveBeenCalled();

        window.confirm.mockReturnValueOnce( true );

        await loadLibrary();
        await deleteItem( 'shot-1' );

        expect( global.InfinityGauntletScreenshotStore.deleteScreenshotLibraryItem ).toHaveBeenCalledWith( 'shot-1' );
    } );
} );
