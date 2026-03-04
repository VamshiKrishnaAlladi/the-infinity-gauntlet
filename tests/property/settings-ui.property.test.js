const settings = require( '../../src/settings' );
const { fc, validUrlPatternArbitrary, uniqueBlockedListArbitrary } = require( '../helpers/generators' );

describe( 'Feature: url-blocker, Property 1: URL List Rendering Completeness (Settings)', () => {
    let urlList;
    let emptyState;

    const uniqueUrlListArbitrary = uniqueBlockedListArbitrary();

    beforeEach( () => {
        document.body.innerHTML = `
            <div class="settings-container">
                <ul id="url-list" class="url-list"></ul>
                <div class="empty-state" id="empty-state">No sites blocked yet</div>
            </div>
        `;

        urlList = document.getElementById( 'url-list' );
        emptyState = document.getElementById( 'empty-state' );
    } );

    afterEach( () => {
        document.body.innerHTML = '';
    } );

    it( 'should render all URLs in the blocked list', async () => {
        await fc.assert(
            fc.asyncProperty( uniqueUrlListArbitrary, async ( urls ) => {
                settings.renderUrlList( urls );

                const renderedItems = urlList.querySelectorAll( '.url-item' );
                expect( renderedItems.length ).toBe( urls.length );

                urls.forEach( ( url, index ) => {
                    const urlText = renderedItems[ index ].querySelector( '.url-text' );
                    expect( urlText ).not.toBeNull();
                    expect( urlText.textContent ).toBe( url );
                } );
            } ),
            { numRuns: 100 }
        );
    } );

    it( 'should render a remove button for each URL', async () => {
        await fc.assert(
            fc.asyncProperty( uniqueUrlListArbitrary, async ( urls ) => {
                settings.renderUrlList( urls );

                const renderedItems = urlList.querySelectorAll( '.url-item' );

                renderedItems.forEach( ( item ) => {
                    const removeButton = item.querySelector( '.remove-button' );
                    expect( removeButton ).not.toBeNull();
                    expect( removeButton.textContent ).toBe( 'Remove' );
                } );
            } ),
            { numRuns: 100 }
        );
    } );

    it( 'should show empty state when URL list is empty', () => {
        settings.renderUrlList( [] );

        expect( emptyState.classList.contains( 'visible' ) ).toBe( true );

        const renderedItems = urlList.querySelectorAll( '.url-item' );
        expect( renderedItems.length ).toBe( 0 );
    } );

    it( 'should hide empty state when URL list is not empty', async () => {
        await fc.assert(
            fc.asyncProperty(
                uniqueUrlListArbitrary.filter( list => list.length > 0 ),
                async ( urls ) => {
                    settings.renderUrlList( urls );

                    expect( emptyState.classList.contains( 'visible' ) ).toBe( false );
                }
            ),
            { numRuns: 100 }
        );
    } );

    it( 'should preserve URL order when rendering', async () => {
        await fc.assert(
            fc.asyncProperty( uniqueUrlListArbitrary, async ( urls ) => {
                settings.renderUrlList( urls );

                const renderedTexts = Array.from(
                    urlList.querySelectorAll( '.url-text' )
                ).map( el => el.textContent );

                expect( renderedTexts ).toEqual( urls );
            } ),
            { numRuns: 100 }
        );
    } );
} );
