( function() {
    function loadImage( dataUrl ) {
        return new Promise( ( resolve, reject ) => {
            const image = new Image();
            image.onload = () => resolve( image );
            image.onerror = () => reject( new Error( 'Failed to load screenshot tile' ) );
            image.src = dataUrl;
        } );
    }

    function getTileCrop( tile, metrics, image, drawnUntilY ) {
        const scale = metrics.devicePixelRatio || 1;
        const captureViewportHeight = metrics.captureViewportHeight || metrics.viewportHeight;
        const captureScrollHeight = metrics.captureScrollHeight || metrics.scrollHeight;
        const pageStartY = Math.max( tile.y, drawnUntilY );
        const pageEndY = Math.min( tile.y + captureViewportHeight, captureScrollHeight );
        if ( pageEndY <= pageStartY ) return null;

        const sourceYOffset = metrics.usesElementScroll ? metrics.scrollContainerTop || 0 : 0;
        const destinationYOffset = metrics.usesElementScroll ? metrics.scrollContainerTop || 0 : 0;
        const sourceXOffset = metrics.usesElementScroll ? metrics.scrollContainerLeft || 0 : 0;
        const sourceWidth = metrics.usesElementScroll
            ? Math.max( 1, ( metrics.scrollContainerRight || metrics.viewportWidth ) - sourceXOffset ) * scale
            : Math.min( image.width, metrics.viewportWidth * scale );
        const sourceY = ( sourceYOffset + pageStartY - tile.y ) * scale;
        const sourceHeight = Math.min(
            image.height - sourceY,
            ( pageEndY - pageStartY ) * scale
        );

        return {
            sourceX: sourceXOffset * scale,
            sourceY,
            sourceWidth: Math.min( image.width - sourceXOffset * scale, sourceWidth ),
            sourceHeight,
            destinationX: ( tile.x + sourceXOffset ) * scale,
            destinationY: ( destinationYOffset + pageStartY ) * scale,
            destinationWidth: Math.min( image.width - sourceXOffset * scale, sourceWidth ),
            destinationHeight: sourceHeight
        };
    }

    function getInitialElementScrollCrop( metrics, image ) {
        const scale = metrics.devicePixelRatio || 1;
        return {
            sourceX: 0,
            sourceY: 0,
            sourceWidth: Math.min( image.width, metrics.viewportWidth * scale ),
            sourceHeight: Math.min( image.height, metrics.viewportHeight * scale ),
            destinationX: 0,
            destinationY: 0,
            destinationWidth: Math.min( image.width, metrics.viewportWidth * scale ),
            destinationHeight: Math.min( image.height, metrics.viewportHeight * scale )
        };
    }

    function getElementScrollBottomChromeCrop( tile, metrics, image ) {
        const scale = metrics.devicePixelRatio || 1;
        const sourceY = ( metrics.scrollContainerBottom || metrics.viewportHeight ) * scale;
        const sourceHeight = image.height - sourceY;
        if ( sourceHeight <= 0 ) return null;

        return {
            sourceX: 0,
            sourceY,
            sourceWidth: Math.min( image.width, metrics.viewportWidth * scale ),
            sourceHeight,
            destinationX: 0,
            destinationY: ( ( metrics.scrollContainerTop || 0 ) + ( metrics.captureScrollHeight || 0 ) ) * scale,
            destinationWidth: Math.min( image.width, metrics.viewportWidth * scale ),
            destinationHeight: sourceHeight
        };
    }

    function drawCrop( context, image, crop ) {
        context.drawImage(
            image,
            crop.sourceX,
            crop.sourceY,
            crop.sourceWidth,
            crop.sourceHeight,
            crop.destinationX,
            crop.destinationY,
            crop.destinationWidth,
            crop.destinationHeight
        );
    }

    function getSamplePoint( image, metrics ) {
        const scale = metrics.devicePixelRatio || 1;
        const y = Math.max( 0, image.height - 2 );
        let x = 1;

        if ( metrics.usesElementScroll ) {
            const leftChromeWidth = ( metrics.scrollContainerLeft || 0 ) * scale;
            const rightChromeStart = ( metrics.scrollContainerRight || metrics.viewportWidth ) * scale;

            if ( leftChromeWidth > 2 ) {
                x = Math.floor( leftChromeWidth / 2 );
            } else if ( rightChromeStart < image.width - 2 ) {
                x = Math.floor( ( rightChromeStart + image.width ) / 2 );
            }
        }

        return {
            x: Math.max( 0, Math.min( image.width - 1, x ) ),
            y
        };
    }

    function getSampledFillColor( image, metrics ) {
        try {
            const sampleCanvas = document.createElement( 'canvas' );
            sampleCanvas.width = image.width;
            sampleCanvas.height = image.height;
            const sampleContext = sampleCanvas.getContext( '2d', { willReadFrequently: true } );
            sampleContext.drawImage( image, 0, 0 );

            const point = getSamplePoint( image, metrics );
            const [ red, green, blue, alpha ] = sampleContext.getImageData( point.x, point.y, 1, 1 ).data;
            return `rgba(${red}, ${green}, ${blue}, ${alpha / 255})`;
        } catch ( error ) {
            return metrics.backgroundColor || '#ffffff';
        }
    }

    async function stitchScreenshotTiles( payload ) {
        const { metrics, tiles } = payload;
        if ( !metrics || !Array.isArray( tiles ) || tiles.length === 0 ) {
            throw new Error( 'No screenshot tiles to stitch' );
        }

        const scale = metrics.devicePixelRatio || 1;
        const canvas = document.createElement( 'canvas' );
        canvas.width = Math.ceil( metrics.scrollWidth * scale );
        canvas.height = Math.ceil( metrics.scrollHeight * scale );

        const context = canvas.getContext( '2d' );
        context.imageSmoothingEnabled = false;

        const sortedTiles = [ ...tiles ].sort( ( a, b ) => a.y - b.y );
        const firstImage = await loadImage( sortedTiles[ 0 ].dataUrl );
        context.fillStyle = getSampledFillColor( firstImage, metrics );
        context.fillRect( 0, 0, canvas.width, canvas.height );
        let drawnUntilY = 0;

        for ( let index = 0; index < sortedTiles.length; index++ ) {
            const tile = sortedTiles[ index ];
            const image = index === 0 ? firstImage : await loadImage( tile.dataUrl );
            if ( metrics.usesElementScroll && index === 0 ) {
                drawCrop( context, image, getInitialElementScrollCrop( metrics, image ) );
                drawnUntilY = Math.min(
                    metrics.captureViewportHeight || metrics.viewportHeight,
                    metrics.captureScrollHeight || metrics.scrollHeight
                );
                continue;
            }

            const crop = getTileCrop( tile, metrics, image, drawnUntilY );
            if ( !crop ) continue;

            drawCrop( context, image, crop );

            drawnUntilY = Math.max(
                drawnUntilY,
                Math.min(
                    tile.y + ( metrics.captureViewportHeight || metrics.viewportHeight ),
                    metrics.captureScrollHeight || metrics.scrollHeight
                )
            );

            if ( metrics.usesElementScroll && index === sortedTiles.length - 1 ) {
                const bottomCrop = getElementScrollBottomChromeCrop( tile, metrics, image );
                if ( bottomCrop ) drawCrop( context, image, bottomCrop );
            }
        }

        return canvas.toDataURL( 'image/png' );
    }

    chrome.runtime.onMessage.addListener( ( message, sender, sendResponse ) => {
        if ( message?.type !== 'stitchScreenshotTiles' ) return false;

        stitchScreenshotTiles( message.payload )
            .then( dataUrl => sendResponse( { success: true, dataUrl } ) )
            .catch( error => sendResponse( {
                success: false,
                error: error.message
            } ) );

        return true;
    } );
} )();
