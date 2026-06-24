( function( root ) {
    const PEN_COLOR = '#ef4444';
    const PEN_WIDTH = 6;
    const HIGHLIGHT_COLOR = 'rgba(250, 204, 21, 0.35)';
    const SOLID_REDACTION_COLOR = '#000000';
    const BLUR_RADIUS_PX = 28;
    const MOSAIC_BLOCK_SIZE = 12;

    const state = {
        items: [],
        objectUrls: []
    };
    const timeFormat = root.InfinityGauntletTimeFormat ||
        ( typeof require !== 'undefined' ? require( './utils/time-format' ) : null );

    function sanitizeFilenamePart( value ) {
        return timeFormat.sanitizeFilenamePart( value );
    }

    function getScreenshotFilename( title, suffix = '' ) {
        return timeFormat.getScreenshotFilename( title, { suffix } );
    }

    function formatBytes( bytes ) {
        if ( !bytes ) return '0 B';
        const units = [ 'B', 'KB', 'MB', 'GB' ];
        let value = bytes;
        let unitIndex = 0;
        while ( value >= 1024 && unitIndex < units.length - 1 ) {
            value /= 1024;
            unitIndex++;
        }
        return `${value.toFixed( unitIndex === 0 ? 0 : 1 )} ${units[ unitIndex ]}`;
    }

    function setStatus( message ) {
        const status = document.getElementById( 'status-message' );
        if ( status ) status.textContent = message || '';
    }

    function rememberObjectUrl( url ) {
        state.objectUrls.push( url );
        return url;
    }

    function createObjectUrl( blob ) {
        return rememberObjectUrl( URL.createObjectURL( blob ) );
    }

    function releaseObjectUrls() {
        for ( const url of state.objectUrls ) {
            URL.revokeObjectURL?.( url );
        }
        state.objectUrls = [];
    }

    async function getImageSource( blob ) {
        if ( root.URL?.createObjectURL ) return createObjectUrl( blob );
        return root.InfinityGauntletScreenshotStore.blobToDataUrl( blob );
    }

    async function loadImage( blob ) {
        const source = await getImageSource( blob );
        return new Promise( ( resolve, reject ) => {
            const image = new Image();
            image.onload = () => resolve( image );
            image.onerror = () => reject( new Error( 'Failed to load screenshot image' ) );
            image.src = source;
        } );
    }

    function applyHighlight( context, rect ) {
        context.fillStyle = HIGHLIGHT_COLOR;
        context.fillRect( rect.x, rect.y, rect.width, rect.height );
    }

    function applySolidRedaction( context, rect ) {
        context.fillStyle = SOLID_REDACTION_COLOR;
        context.fillRect( rect.x, rect.y, rect.width, rect.height );
    }

    function applyBlur( canvas, context, rect ) {
        const padding = BLUR_RADIUS_PX * 3;
        const sourceX = Math.max( 0, rect.x - padding );
        const sourceY = Math.max( 0, rect.y - padding );
        const sourceRight = Math.min( canvas.width, rect.x + rect.width + padding );
        const sourceBottom = Math.min( canvas.height, rect.y + rect.height + padding );
        const sourceWidth = sourceRight - sourceX;
        const sourceHeight = sourceBottom - sourceY;
        const offsetX = rect.x - sourceX;
        const offsetY = rect.y - sourceY;
        const tempCanvas = document.createElement( 'canvas' );
        tempCanvas.width = Math.max( 1, Math.round( sourceWidth ) );
        tempCanvas.height = Math.max( 1, Math.round( sourceHeight ) );
        const tempContext = tempCanvas.getContext( '2d' );

        tempContext.filter = `blur(${BLUR_RADIUS_PX}px)`;
        tempContext.drawImage( canvas, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, tempCanvas.width, tempCanvas.height );
        context.drawImage( tempCanvas, offsetX, offsetY, rect.width, rect.height, rect.x, rect.y, rect.width, rect.height );
    }

    function applyMosaic( canvas, context, rect ) {
        const smallWidth = Math.max( 1, Math.ceil( rect.width / MOSAIC_BLOCK_SIZE ) );
        const smallHeight = Math.max( 1, Math.ceil( rect.height / MOSAIC_BLOCK_SIZE ) );
        const tempCanvas = document.createElement( 'canvas' );
        tempCanvas.width = smallWidth;
        tempCanvas.height = smallHeight;
        const tempContext = tempCanvas.getContext( '2d' );

        tempContext.imageSmoothingEnabled = true;
        tempContext.drawImage( canvas, rect.x, rect.y, rect.width, rect.height, 0, 0, smallWidth, smallHeight );
        context.imageSmoothingEnabled = false;
        context.drawImage( tempCanvas, 0, 0, smallWidth, smallHeight, rect.x, rect.y, rect.width, rect.height );
        context.imageSmoothingEnabled = true;
    }

    function applyRectEdit( canvas, context, edit ) {
        if ( edit.tool === 'highlight' ) {
            applyHighlight( context, edit.rect );
        } else if ( edit.mode === 'blur' ) {
            applyBlur( canvas, context, edit.rect );
        } else if ( edit.mode === 'solid' ) {
            applySolidRedaction( context, edit.rect );
        } else {
            applyMosaic( canvas, context, edit.rect );
        }
    }

    function drawPenStroke( context, edit ) {
        if ( !Array.isArray( edit.points ) || edit.points.length < 2 ) return;

        context.strokeStyle = edit.color || PEN_COLOR;
        context.lineWidth = edit.width || PEN_WIDTH;
        context.lineCap = 'round';
        context.lineJoin = 'round';
        context.beginPath();
        context.moveTo( edit.points[ 0 ].x, edit.points[ 0 ].y );
        for ( const point of edit.points.slice( 1 ) ) {
            context.lineTo( point.x, point.y );
        }
        context.stroke();
    }

    async function renderEditedBlob( item ) {
        const image = await loadImage( item.originalBlob );
        const canvas = document.createElement( 'canvas' );
        canvas.width = image.naturalWidth || image.width;
        canvas.height = image.naturalHeight || image.height;
        const context = canvas.getContext( '2d' );
        context.drawImage( image, 0, 0 );

        for ( const edit of item.edits || [] ) {
            if ( edit.kind === 'rect' ) {
                applyRectEdit( canvas, context, edit );
            } else if ( edit.kind === 'pen' ) {
                drawPenStroke( context, edit );
            }
        }

        if ( canvas.toBlob ) {
            return new Promise( resolve => {
                canvas.toBlob( blob => resolve( blob ), 'image/png' );
            } );
        }

        return root.InfinityGauntletScreenshotStore.dataUrlToBlob( canvas.toDataURL( 'image/png' ) );
    }

    async function downloadBlob( blob, filename ) {
        const url = createObjectUrl( blob );
        await chrome.downloads.download( {
            url,
            filename,
            saveAs: false
        } );
    }

    function getReviewUrl( id ) {
        const path = `src/screenshot-review.html?id=${encodeURIComponent( id )}`;
        return chrome.runtime?.getURL ? chrome.runtime.getURL( path ) : `screenshot-review.html?id=${encodeURIComponent( id )}`;
    }

    function openItem( id ) {
        const url = getReviewUrl( id );
        if ( chrome.tabs?.create ) {
            chrome.tabs.create( { url } );
            return;
        }
        window.open( url, '_blank', 'noopener' );
    }

    async function exportEdited( id ) {
        const item = await root.InfinityGauntletScreenshotStore.getScreenshotLibraryItem( id );
        if ( !item ) return;

        setStatus( 'Preparing edited export...' );
        const editedBlob = await renderEditedBlob( item );
        await downloadBlob( editedBlob, getScreenshotFilename( item.title, 'edited' ) );
        setStatus( 'Edited PNG exported.' );
    }

    async function exportOriginal( id ) {
        const item = await root.InfinityGauntletScreenshotStore.getScreenshotLibraryItem( id );
        if ( !item ) return;
        if ( !window.confirm( 'Export the original screenshot? It may contain sensitive content.' ) ) return;

        await downloadBlob( item.originalBlob, getScreenshotFilename( item.title, 'original' ) );
        setStatus( 'Original PNG exported.' );
    }

    async function deleteItem( id ) {
        const item = state.items.find( candidate => candidate.id === id );
        const label = item?.title || 'this screenshot';
        if ( !window.confirm( `Delete "${label}" from the screenshot library?` ) ) return;

        await root.InfinityGauntletScreenshotStore.deleteScreenshotLibraryItem( id );
        await loadLibrary();
        setStatus( 'Screenshot deleted.' );
    }

    const ACTION_ICONS = {
        exportEdited: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12" /><path d="M8 11l4 4l4-4" /><path d="M5 19h14" /></svg>',
        exportOriginal: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10v10H4z" /><path d="M7 10h4" /><path d="M7 14h3" /><path d="M17 7v9" /><path d="M14 13l3 3l3-3" /><path d="M13 20h8" /></svg>',
        delete: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M6 6l1 15h10l1-15" /><path d="M10 11v6" /><path d="M14 11v6" /></svg>'
    };

    function createActionButton( label, iconName, className, onClick ) {
        const button = document.createElement( 'button' );
        button.type = 'button';
        button.innerHTML = ACTION_ICONS[ iconName ];
        button.setAttribute( 'aria-label', label );
        button.title = label;
        if ( className ) button.className = className;
        button.addEventListener( 'click', onClick );
        return button;
    }

    function renderItemCard( item ) {
        const card = document.createElement( 'article' );
        card.className = 'library-card';

        const imageWrap = document.createElement( 'button' );
        imageWrap.type = 'button';
        imageWrap.className = 'library-thumbnail-wrap';
        imageWrap.setAttribute( 'aria-label', `Open ${item.title} for editing` );
        imageWrap.title = 'Open for editing';
        imageWrap.addEventListener( 'click', () => openItem( item.id ) );

        const image = document.createElement( 'img' );
        image.className = 'library-thumbnail';
        image.alt = '';
        image.src = createObjectUrl( item.thumbnailBlob || item.originalBlob );

        const actions = document.createElement( 'div' );
        actions.className = 'library-actions';
        actions.addEventListener( 'click', event => event.stopPropagation() );
        actions.appendChild( createActionButton( 'Export edited', 'exportEdited', 'primary', () => exportEdited( item.id ).catch( handleActionError ) ) );
        actions.appendChild( createActionButton( 'Export original', 'exportOriginal', '', () => exportOriginal( item.id ).catch( handleActionError ) ) );
        actions.appendChild( createActionButton( 'Delete', 'delete', 'danger', () => deleteItem( item.id ).catch( handleActionError ) ) );
        imageWrap.appendChild( image );
        imageWrap.appendChild( actions );

        const body = document.createElement( 'div' );
        body.className = 'library-card-body';

        const title = document.createElement( 'h2' );
        title.className = 'library-title';
        title.textContent = item.title;
        title.title = item.title;

        const meta = document.createElement( 'div' );
        meta.className = 'library-meta';
        const created = document.createElement( 'span' );
        created.textContent = `Created - ${timeFormat.formatDisplayTimestamp( item.createdAt )}`;
        const updated = document.createElement( 'span' );
        updated.textContent = item.updatedAt && item.updatedAt !== item.createdAt
            ? `Updated - ${timeFormat.formatDisplayTimestamp( item.updatedAt )}`
            : 'Not edited yet';
        meta.appendChild( created );
        meta.appendChild( updated );

        body.appendChild( title );
        body.appendChild( meta );
        card.appendChild( imageWrap );
        card.appendChild( body );
        return card;
    }

    function handleActionError( error ) {
        console.error( 'Screenshot library action failed:', error );
        setStatus( 'Library action failed.' );
    }

    async function renderUsage() {
        const usage = await root.InfinityGauntletScreenshotStore.getScreenshotLibraryUsage();
        const quotaText = usage.quota ? `, ${formatBytes( usage.usage || 0 )} used of ${formatBytes( usage.quota )} browser quota` : '';
        const summary = document.getElementById( 'usage-summary' );
        if ( summary ) {
            summary.textContent = `${usage.itemCount} item${usage.itemCount === 1 ? '' : 's'}, ${formatBytes( usage.trackedBytes )} tracked${quotaText}`;
        }
    }

    async function loadLibrary() {
        releaseObjectUrls();
        const search = document.getElementById( 'search-input' )?.value || '';
        state.items = await root.InfinityGauntletScreenshotStore.listScreenshotLibraryItems( { search } );
        const grid = document.getElementById( 'library-grid' );
        const emptyState = document.getElementById( 'empty-state' );
        if ( !grid ) return;

        grid.replaceChildren();
        for ( const item of state.items ) {
            grid.appendChild( renderItemCard( item ) );
        }

        if ( emptyState ) emptyState.classList.toggle( 'hidden', state.items.length > 0 );
        await renderUsage();
    }

    function setupEventListeners() {
        document.getElementById( 'search-input' )?.addEventListener( 'input', () => {
            loadLibrary().catch( handleActionError );
        } );
        window.addEventListener( 'pagehide', releaseObjectUrls );
    }

    if ( typeof document !== 'undefined' ) {
        document.addEventListener( 'DOMContentLoaded', () => {
            setupEventListeners();
            loadLibrary().catch( handleActionError );
        } );
    }

    const api = {
        formatBytes,
        formatDisplayTimestamp: timeFormat.formatDisplayTimestamp,
        sanitizeFilenamePart,
        renderEditedBlob,
        getReviewUrl,
        loadLibrary,
        openItem,
        exportEdited,
        exportOriginal,
        deleteItem,
        state
    };

    if ( typeof module !== 'undefined' && module.exports ) {
        module.exports = api;
    }
} )( typeof globalThis !== 'undefined' ? globalThis : window );
