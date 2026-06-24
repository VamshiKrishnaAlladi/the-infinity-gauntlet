const {
    findBestVisualOverlapHeight,
    getCapturedContentHeight,
    getCropAfterSkippingOverlap,
    getCropWithVisualOverlapFallback,
    getDrawnUntilY,
    getTileCrop
} = require( '../../src/screenshot-stitcher' );

describe( 'Screenshot Stitcher Module', () => {
    function makeRowData( rowIds, width ) {
        const data = new Uint8ClampedArray( rowIds.length * width * 4 );
        rowIds.forEach( ( rowId, y ) => {
            for ( let x = 0; x < width; x++ ) {
                const offset = ( y * width + x ) * 4;
                data[ offset ] = ( rowId * 7 + x * 3 ) % 255;
                data[ offset + 1 ] = ( rowId * 11 + x * 5 ) % 255;
                data[ offset + 2 ] = ( rowId * 13 + x * 7 ) % 255;
                data[ offset + 3 ] = 255;
            }
        } );
        return data;
    }

    it( 'should use actual captured image height for window-scroll tile crops', () => {
        const metrics = {
            devicePixelRatio: 1,
            viewportWidth: 800,
            viewportHeight: 700,
            captureViewportHeight: 700,
            scrollHeight: 1200,
            captureScrollHeight: 1200,
            usesElementScroll: false
        };
        const image = {
            width: 800,
            height: 560
        };

        const crop = getTileCrop( { x: 0, y: 300 }, metrics, image, 560 );

        expect( getCapturedContentHeight( metrics, image ) ).toBe( 560 );
        expect( crop ).toEqual( expect.objectContaining( {
            sourceY: 260,
            sourceHeight: 300,
            destinationY: 560,
            destinationHeight: 300
        } ) );
    } );

    it( 'should use actual captured scroll-container height for element-scroll tile crops', () => {
        const metrics = {
            devicePixelRatio: 1,
            viewportWidth: 1000,
            viewportHeight: 800,
            captureViewportHeight: 700,
            scrollContainerTop: 50,
            scrollContainerBottom: 750,
            scrollContainerLeft: 0,
            scrollContainerRight: 1000,
            scrollHeight: 1650,
            captureScrollHeight: 1600,
            usesElementScroll: true
        };
        const image = {
            width: 1000,
            height: 690
        };

        const crop = getTileCrop( { x: 0, y: 300 }, metrics, image, 640 );

        expect( getCapturedContentHeight( metrics, image ) ).toBe( 640 );
        expect( crop ).toEqual( expect.objectContaining( {
            sourceY: 390,
            sourceHeight: 300,
            destinationY: 690,
            destinationHeight: 300
        } ) );
        expect( getDrawnUntilY( crop, metrics ) ).toBe( 940 );
    } );

    it( 'should find the visual overlap when geometry is slightly wrong', () => {
        const width = 32;
        const previousRows = Array.from( { length: 60 }, ( _, index ) => index + 40 );
        const currentRows = Array.from( { length: 60 }, ( _, index ) => index + 70 );

        const overlap = findBestVisualOverlapHeight( {
            previousData: makeRowData( previousRows, width ),
            currentData: makeRowData( currentRows, width ),
            width,
            previousHeight: previousRows.length,
            currentHeight: currentRows.length,
            expectedOverlap: 22,
            minOverlap: 10,
            maxOverlap: 50,
            searchRadius: 20,
            maxAverageDiff: 1
        } );

        expect( overlap ).toBe( 30 );
    } );

    it( 'should reject far visual matches in repetitive content', () => {
        const width = 32;
        const previousRows = Array.from( { length: 140 }, ( _, index ) => index + 100 );
        const currentRows = Array.from( { length: 140 }, ( _, index ) => index + 180 );

        const overlap = findBestVisualOverlapHeight( {
            previousData: makeRowData( previousRows, width ),
            currentData: makeRowData( currentRows, width ),
            width,
            previousHeight: previousRows.length,
            currentHeight: currentRows.length,
            expectedOverlap: 32,
            minOverlap: 10,
            maxOverlap: 120,
            searchRadius: 100,
            maxDeviation: 24,
            maxAverageDiff: 1
        } );

        expect( overlap ).toBeNull();
    } );

    it( 'should not visually match low-information bands', () => {
        const width = 32;
        const height = 60;
        const flatData = new Uint8ClampedArray( width * height * 4 );

        const overlap = findBestVisualOverlapHeight( {
            previousData: flatData,
            currentData: flatData,
            width,
            previousHeight: height,
            currentHeight: height,
            expectedOverlap: 30,
            minOverlap: 10,
            maxOverlap: 50,
            searchRadius: 20,
            maxAverageDiff: 1
        } );

        expect( overlap ).toBeNull();
    } );

    it( 'should convert a visual overlap into a crop at the stitched boundary', () => {
        const crop = {
            sourceX: 0,
            sourceY: 50,
            sourceWidth: 100,
            sourceHeight: 300,
            destinationX: 0,
            destinationY: 250,
            destinationWidth: 100,
            destinationHeight: 300
        };

        expect( getCropAfterSkippingOverlap( crop, 80, 620, {
            devicePixelRatio: 1,
            usesElementScroll: true,
            scrollContainerTop: 50
        } ) ).toEqual( {
            sourceX: 0,
            sourceY: 130,
            sourceWidth: 100,
            sourceHeight: 220,
            destinationX: 0,
            destinationY: 670,
            destinationWidth: 100,
            destinationHeight: 220
        } );
    } );

    it( 'should reject a final visual-overlap crop that clips page bottom', () => {
        const crop = {
            sourceX: 0,
            sourceY: 0,
            sourceWidth: 100,
            sourceHeight: 300,
            destinationX: 0,
            destinationY: 500,
            destinationWidth: 100,
            destinationHeight: 300
        };

        expect( getCropAfterSkippingOverlap( crop, 120, 620, {
            devicePixelRatio: 1,
            usesElementScroll: false
        }, 900 ) ).toBeNull();

        expect( getCropAfterSkippingOverlap( crop, 20, 620, {
            devicePixelRatio: 1,
            usesElementScroll: false
        }, 900 ) ).toEqual( expect.objectContaining( {
            sourceY: 20,
            sourceHeight: 280,
            destinationY: 620,
            destinationHeight: 280
        } ) );
    } );

    it( 'should fall back to geometry crop when final visual crop is rejected', () => {
        const geometryCrop = {
            sourceX: 0,
            sourceY: 100,
            sourceWidth: 100,
            sourceHeight: 300,
            destinationX: 0,
            destinationY: 600,
            destinationWidth: 100,
            destinationHeight: 300
        };
        const fullTileCrop = {
            sourceX: 0,
            sourceY: 0,
            sourceWidth: 100,
            sourceHeight: 400,
            destinationX: 0,
            destinationY: 500,
            destinationWidth: 100,
            destinationHeight: 400
        };

        expect( getCropWithVisualOverlapFallback(
            geometryCrop,
            fullTileCrop,
            250,
            600,
            {
                devicePixelRatio: 1,
                usesElementScroll: false
            },
            900
        ) ).toBe( geometryCrop );
    } );
} );
