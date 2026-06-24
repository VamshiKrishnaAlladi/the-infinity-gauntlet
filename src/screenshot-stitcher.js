( function() {
    const VISUAL_OVERLAP_MIN_PX = 24;
    const VISUAL_OVERLAP_MAX_PX = 900;
    const VISUAL_OVERLAP_SEARCH_RADIUS_PX = 160;
    const VISUAL_OVERLAP_MAX_DEVIATION_PX = 24;
    const VISUAL_OVERLAP_MAX_AVERAGE_DIFF = 10;
    const VISUAL_OVERLAP_MIN_INFORMATION = 1;
    const VISUAL_OVERLAP_SAMPLE_STEP_PX = 8;

    function loadImage( dataUrl ) {
        return new Promise( ( resolve, reject ) => {
            const image = new Image();
            image.onload = () => resolve( image );
            image.onerror = () => reject( new Error( 'Failed to load screenshot tile' ) );
            image.src = dataUrl;
        } );
    }

    function getCapturedContentHeight( metrics, image ) {
        const scale = metrics.devicePixelRatio || 1;
        const capturedViewportHeight = image.height / scale;
        if ( !metrics.usesElementScroll ) return capturedViewportHeight;

        const scrollContainerTop = metrics.scrollContainerTop || 0;
        const scrollContainerBottom = Math.min(
            metrics.scrollContainerBottom || metrics.viewportHeight || capturedViewportHeight,
            capturedViewportHeight
        );
        return Math.max( 0, scrollContainerBottom - scrollContainerTop );
    }

    function getTileCrop( tile, metrics, image, drawnUntilY ) {
        const scale = metrics.devicePixelRatio || 1;
        const capturedContentHeight = getCapturedContentHeight( metrics, image );
        const captureScrollHeight = metrics.captureScrollHeight || metrics.scrollHeight;
        const pageStartY = Math.max( tile.y, drawnUntilY );
        const pageEndY = Math.min( tile.y + capturedContentHeight, captureScrollHeight );
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

    function getDrawnUntilY( crop, metrics ) {
        const scale = metrics.devicePixelRatio || 1;
        const destinationYOffset = metrics.usesElementScroll ? metrics.scrollContainerTop || 0 : 0;
        return ( crop.destinationY + crop.destinationHeight ) / scale - destinationYOffset;
    }

    function getCropAfterSkippingOverlap( crop, overlapPx, destinationY, metrics, minimumDrawnUntilY ) {
        const scale = metrics.devicePixelRatio || 1;
        const destinationYOffset = metrics.usesElementScroll ? metrics.scrollContainerTop || 0 : 0;
        const adjustedSourceHeight = crop.sourceHeight - overlapPx;
        if ( adjustedSourceHeight <= 0 ) return null;

        const adjustedCrop = {
            ...crop,
            sourceY: crop.sourceY + overlapPx,
            sourceHeight: adjustedSourceHeight,
            destinationY: ( destinationYOffset + destinationY ) * scale,
            destinationHeight: adjustedSourceHeight
        };

        if (
            typeof minimumDrawnUntilY === 'number' &&
            getDrawnUntilY( adjustedCrop, metrics ) < minimumDrawnUntilY
        ) {
            return null;
        }

        return adjustedCrop;
    }

    function getCropWithVisualOverlapFallback( geometryCrop, fullTileCrop, visualOverlap, drawnUntilY, metrics, minimumDrawnUntilY ) {
        if ( visualOverlap === null || !fullTileCrop ) return geometryCrop;

        return getCropAfterSkippingOverlap(
            fullTileCrop,
            visualOverlap,
            drawnUntilY,
            metrics,
            minimumDrawnUntilY
        ) || geometryCrop;
    }

    function getPixelOffset( x, y, width, channels ) {
        return ( y * width + x ) * channels;
    }

    function getBandDifference( firstData, secondData, width, channels, firstStartY, secondStartY, height ) {
        let difference = 0;
        let samples = 0;

        for ( let y = 0; y < height; y++ ) {
            for ( let x = 0; x < width; x += VISUAL_OVERLAP_SAMPLE_STEP_PX ) {
                const firstOffset = getPixelOffset( x, firstStartY + y, width, channels );
                const secondOffset = getPixelOffset( x, secondStartY + y, width, channels );
                difference += Math.abs( firstData[ firstOffset ] - secondData[ secondOffset ] );
                difference += Math.abs( firstData[ firstOffset + 1 ] - secondData[ secondOffset + 1 ] );
                difference += Math.abs( firstData[ firstOffset + 2 ] - secondData[ secondOffset + 2 ] );
                samples += 3;
            }
        }

        return samples === 0 ? Infinity : difference / samples;
    }

    function getBandInformation( data, width, channels, startY, height ) {
        let difference = 0;
        let samples = 0;

        for ( let y = 1; y < height; y++ ) {
            for ( let x = 0; x < width; x += VISUAL_OVERLAP_SAMPLE_STEP_PX ) {
                const previousOffset = getPixelOffset( x, startY + y - 1, width, channels );
                const currentOffset = getPixelOffset( x, startY + y, width, channels );
                difference += Math.abs( data[ previousOffset ] - data[ currentOffset ] );
                difference += Math.abs( data[ previousOffset + 1 ] - data[ currentOffset + 1 ] );
                difference += Math.abs( data[ previousOffset + 2 ] - data[ currentOffset + 2 ] );
                samples += 3;
            }
        }

        return samples === 0 ? 0 : difference / samples;
    }

    function findBestVisualOverlapHeight( options ) {
        const {
            previousData,
            currentData,
            width,
            previousHeight,
            currentHeight,
            expectedOverlap,
            channels = 4,
            minOverlap = VISUAL_OVERLAP_MIN_PX,
            maxOverlap = VISUAL_OVERLAP_MAX_PX,
            searchRadius = VISUAL_OVERLAP_SEARCH_RADIUS_PX,
            maxDeviation = VISUAL_OVERLAP_MAX_DEVIATION_PX,
            maxAverageDiff = VISUAL_OVERLAP_MAX_AVERAGE_DIFF,
            minInformation = VISUAL_OVERLAP_MIN_INFORMATION
        } = options;
        const upperBound = Math.min( previousHeight, currentHeight, maxOverlap );
        const lowerBound = Math.max( minOverlap, 1 );
        if ( upperBound < lowerBound ) return null;

        const searchStart = Math.max( lowerBound, expectedOverlap - searchRadius );
        const searchEnd = Math.min( upperBound, expectedOverlap + searchRadius );
        let bestOverlap = null;
        let bestScore = Infinity;

        for ( let overlap = searchStart; overlap <= searchEnd; overlap++ ) {
            const previousStartY = previousHeight - overlap;
            const currentStartY = 0;
            const currentInformation = getBandInformation( currentData, width, channels, currentStartY, overlap );
            const previousInformation = getBandInformation( previousData, width, channels, previousStartY, overlap );
            if ( Math.max( currentInformation, previousInformation ) < minInformation ) continue;

            const score = getBandDifference(
                previousData,
                currentData,
                width,
                channels,
                previousStartY,
                currentStartY,
                overlap
            );
            const scoreTieBreak = Math.abs( overlap - expectedOverlap ) * 0.001;
            if ( score + scoreTieBreak < bestScore ) {
                bestScore = score + scoreTieBreak;
                bestOverlap = overlap;
            }
        }

        if ( bestOverlap === null || bestScore > maxAverageDiff ) return null;
        if ( Math.abs( bestOverlap - expectedOverlap ) > maxDeviation ) return null;
        return bestOverlap;
    }

    function getImageDataFromImage( image, sourceX, sourceY, width, height ) {
        const sampleCanvas = document.createElement( 'canvas' );
        sampleCanvas.width = image.width;
        sampleCanvas.height = image.height;
        const sampleContext = sampleCanvas.getContext( '2d', { willReadFrequently: true } );
        sampleContext.drawImage( image, 0, 0 );
        return sampleContext.getImageData( sourceX, sourceY, width, height ).data;
    }

    function getVisualOverlapHeight( context, image, crop, tile, metrics, drawnUntilY ) {
        const scale = metrics.devicePixelRatio || 1;
        const destinationYOffset = metrics.usesElementScroll ? metrics.scrollContainerTop || 0 : 0;
        const expectedOverlap = Math.round( Math.max( 0, drawnUntilY - tile.y ) * scale );
        if ( expectedOverlap < VISUAL_OVERLAP_MIN_PX ) return null;

        const boundaryY = Math.round( ( destinationYOffset + drawnUntilY ) * scale );
        const maxSearchOverlap = Math.min(
            Math.round( VISUAL_OVERLAP_MAX_PX * scale ),
            crop.sourceHeight - 1,
            boundaryY,
            expectedOverlap + Math.round( VISUAL_OVERLAP_SEARCH_RADIUS_PX * scale )
        );
        if ( maxSearchOverlap < VISUAL_OVERLAP_MIN_PX ) return null;

        const sourceX = Math.round( crop.sourceX );
        const sourceY = Math.round( crop.sourceY );
        const destinationX = Math.round( crop.destinationX );
        const previousY = boundaryY - maxSearchOverlap;
        const sampleWidth = Math.floor(
            Math.min(
                crop.sourceWidth,
                crop.destinationWidth,
                image.width - sourceX,
                context.canvas.width - destinationX
            )
        );
        if ( sampleWidth <= 0 || previousY < 0 ) return null;

        try {
            const previousData = context.getImageData(
                destinationX,
                previousY,
                sampleWidth,
                maxSearchOverlap
            ).data;
            const currentData = getImageDataFromImage(
                image,
                sourceX,
                sourceY,
                sampleWidth,
                maxSearchOverlap
            );

            return findBestVisualOverlapHeight( {
                previousData,
                currentData,
                width: sampleWidth,
                previousHeight: maxSearchOverlap,
                currentHeight: maxSearchOverlap,
                expectedOverlap,
                minOverlap: Math.round( VISUAL_OVERLAP_MIN_PX * scale ),
                maxOverlap: maxSearchOverlap,
                searchRadius: Math.round( VISUAL_OVERLAP_SEARCH_RADIUS_PX * scale ),
                maxDeviation: Math.round( VISUAL_OVERLAP_MAX_DEVIATION_PX * scale )
            } );
        } catch ( error ) {
            return null;
        }
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
                const firstScrollCrop = getTileCrop( tile, metrics, image, 0 );
                if ( firstScrollCrop ) {
                    drawCrop( context, image, firstScrollCrop );
                    drawnUntilY = Math.min(
                        getDrawnUntilY( firstScrollCrop, metrics ),
                        metrics.captureScrollHeight || metrics.scrollHeight
                    );
                }
                continue;
            }

            const geometryCrop = getTileCrop( tile, metrics, image, drawnUntilY );
            const fullTileCrop = getTileCrop( tile, metrics, image, tile.y );
            const visualOverlap = fullTileCrop
                ? getVisualOverlapHeight( context, image, fullTileCrop, tile, metrics, drawnUntilY )
                : null;
            const minimumDrawnUntilY = index === sortedTiles.length - 1
                ? metrics.captureScrollHeight || metrics.scrollHeight
                : undefined;
            const crop = getCropWithVisualOverlapFallback(
                geometryCrop,
                fullTileCrop,
                visualOverlap,
                drawnUntilY,
                metrics,
                minimumDrawnUntilY
            );
            if ( !crop ) continue;

            drawCrop( context, image, crop );

            drawnUntilY = Math.max(
                drawnUntilY,
                Math.min(
                    getDrawnUntilY( crop, metrics ),
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

    if ( typeof module !== 'undefined' && module.exports ) {
        module.exports = {
            findBestVisualOverlapHeight,
            getCapturedContentHeight,
            getCropAfterSkippingOverlap,
            getCropWithVisualOverlapFallback,
            getDrawnUntilY,
            getTileCrop
        };
    }
} )();
