( function( root ) {
    const MAX_HISTORY_STATES = 100;
    const PEN_COLOR = '#ef4444';
    const PEN_WIDTH = 6;
    const HIGHLIGHT_COLOR = 'rgba(250, 204, 21, 0.35)';
    const BLUR_RADIUS_PX = 28;
    const MOSAIC_BLOCK_SIZE = 12;

    const state = {
        id: null,
        title: 'Untitled Page',
        createdAt: null,
        dataUrl: null,
        tool: 'redact',
        redactMode: 'mosaic',
        image: null,
        backingCanvas: null,
        backingContext: null,
        visibleCanvas: null,
        visibleContext: null,
        isDrawing: false,
        startPoint: null,
        lastPoint: null,
        previewPoint: null,
        edits: [],
        selectedEditId: null,
        activeInteraction: null,
        undoStack: [],
        redoStack: [],
        tempDeleted: false
    };

    function padDatePart( value ) {
        return value.toString().padStart( 2, '0' );
    }

    function getLocalTimestampPrefix( date = new Date() ) {
        return [
            date.getFullYear(),
            padDatePart( date.getMonth() + 1 ),
            padDatePart( date.getDate() )
        ].join( '-' ) + ` ${padDatePart( date.getHours() )}-${padDatePart( date.getMinutes() )}-${padDatePart( date.getSeconds() )}`;
    }

    function sanitizeFilenamePart( value ) {
        return ( value || 'Untitled Page' )
            .replace( /[<>:"/\\|?*\u0000-\u001F]/g, ' ' )
            .replace( /\s+/g, ' ' )
            .trim()
            .slice( 0, 120 ) || 'Untitled Page';
    }

    function getScreenshotFilename( title, date = new Date() ) {
        return `[${getLocalTimestampPrefix( date )}] ${sanitizeFilenamePart( title )}.png`;
    }

    function getScreenshotIdFromUrl() {
        return new URLSearchParams( window.location.search ).get( 'id' );
    }

    function setStatus( message ) {
        const status = document.getElementById( 'status-message' );
        if ( status ) status.textContent = message || '';
    }

    function setTitleText( title ) {
        const titleElement = document.getElementById( 'review-title' );
        if ( titleElement ) {
            titleElement.textContent = title;
            titleElement.title = 'Click to edit screenshot title';
        }
        const titleInput = document.getElementById( 'review-title-input' );
        if ( titleInput ) titleInput.value = title;
        document.title = `Screenshot Review - ${title}`;
    }

    async function persistTitleChange( rawTitle ) {
        const nextTitle = rawTitle.replace( /\s+/g, ' ' ).trim() || 'Untitled Page';
        state.title = nextTitle;
        setTitleText( nextTitle );

        if ( state.id && state.dataUrl ) {
            await root.InfinityGauntletScreenshotStore.putTemporaryScreenshot( {
                id: state.id,
                dataUrl: state.dataUrl,
                title: state.title,
                createdAt: state.createdAt || Date.now()
            } );
        }

        return nextTitle;
    }

    function beginTitleEdit() {
        const titleElement = document.getElementById( 'review-title' );
        const titleInput = document.getElementById( 'review-title-input' );
        if ( !titleElement || !titleInput || !titleInput.classList.contains( 'hidden' ) ) return;

        titleInput.value = state.title;
        titleElement.classList.add( 'hidden' );
        titleInput.classList.remove( 'hidden' );
        titleInput.focus();
        titleInput.select();
    }

    function finishTitleEdit() {
        const titleElement = document.getElementById( 'review-title' );
        const titleInput = document.getElementById( 'review-title-input' );
        if ( !titleElement || !titleInput || titleInput.classList.contains( 'hidden' ) ) return;

        titleInput.classList.add( 'hidden' );
        titleElement.classList.remove( 'hidden' );
        persistTitleChange( titleInput.value || '' ).catch( error => {
            console.error( 'Failed to save screenshot title:', error );
            setStatus( 'Failed to save title change.' );
        } );
    }

    function cancelTitleEdit() {
        const titleElement = document.getElementById( 'review-title' );
        const titleInput = document.getElementById( 'review-title-input' );
        if ( !titleElement || !titleInput ) return;

        titleInput.value = state.title;
        titleInput.classList.add( 'hidden' );
        titleElement.classList.remove( 'hidden' );
    }

    function runUndo() {
        return undo().catch( error => {
            console.error( 'Failed to undo screenshot edit:', error );
            setStatus( 'Failed to undo edit.' );
        } );
    }

    function runRedo() {
        return redo().catch( error => {
            console.error( 'Failed to redo screenshot edit:', error );
            setStatus( 'Failed to redo edit.' );
        } );
    }

    function isEditingText( target ) {
        return target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
    }

    function handleKeyboardShortcuts( event ) {
        if ( isEditingText( event.target ) ) return;
        if ( !( event.metaKey || event.ctrlKey ) ) return;

        const key = event.key.toLowerCase();
        if ( key === 'z' && !event.shiftKey ) {
            event.preventDefault();
            runUndo();
        } else if ( key === 'y' ) {
            event.preventDefault();
            runRedo();
        }
    }

    function setActiveTool( tool ) {
        state.tool = tool;
        for ( const button of document.querySelectorAll( '[data-tool]' ) ) {
            button.classList.toggle( 'active', button.dataset.tool === tool );
        }
    }

    function updateBlurWarning() {
        const warning = document.getElementById( 'blur-warning' );
        if ( !warning ) return;
        warning.classList.toggle( 'hidden', !( state.tool === 'redact' && state.redactMode === 'blur' ) );
    }

    function setRedactMode( mode ) {
        state.redactMode = mode;
        setActiveTool( 'redact' );

        for ( const item of document.querySelectorAll( '[data-redact-mode]' ) ) {
            item.classList.toggle( 'active', item.dataset.redactMode === mode );
        }

        const toggle = document.getElementById( 'redact-mode-toggle' );
        if ( toggle ) {
            toggle.title = `Redaction mode: ${mode === 'blur' ? 'Blur' : 'Mosaic'}`;
            toggle.setAttribute( 'aria-label', `Redaction mode: ${mode === 'blur' ? 'Blur' : 'Mosaic'}` );
        }

        updateBlurWarning();
    }

    function setRedactMenuOpen( isOpen ) {
        const menu = document.getElementById( 'redact-mode-menu' );
        const toggle = document.getElementById( 'redact-mode-toggle' );
        if ( menu ) menu.classList.toggle( 'hidden', !isOpen );
        if ( toggle ) toggle.setAttribute( 'aria-expanded', isOpen ? 'true' : 'false' );
    }

    function updateHistoryButtons() {
        const undoButton = document.getElementById( 'undo-button' );
        const redoButton = document.getElementById( 'redo-button' );
        if ( undoButton ) undoButton.disabled = state.undoStack.length === 0;
        if ( redoButton ) redoButton.disabled = state.redoStack.length === 0;
    }

    function trimHistory() {
        while ( state.undoStack.length > MAX_HISTORY_STATES ) {
            state.undoStack.shift();
        }
    }

    function pushHistory() {
        state.undoStack.push( createHistorySnapshot() );
        trimHistory();
        state.redoStack = [];
        updateHistoryButtons();
    }

    function createCanvasSnapshot() {
        return state.backingCanvas.toDataURL( 'image/png' );
    }

    function createHistorySnapshot() {
        return JSON.stringify( {
            edits: state.edits,
            selectedEditId: state.selectedEditId
        } );
    }

    function restoreHistorySnapshot( snapshot ) {
        const parsed = JSON.parse( snapshot );
        state.edits = parsed.edits || [];
        state.selectedEditId = parsed.selectedEditId || null;
        renderBackingCanvas();
        renderVisibleCanvas();
    }

    async function undo() {
        if ( state.undoStack.length === 0 ) return;
        state.redoStack.push( createHistorySnapshot() );
        restoreHistorySnapshot( state.undoStack.pop() );
        updateHistoryButtons();
    }

    async function redo() {
        if ( state.redoStack.length === 0 ) return;
        state.undoStack.push( createHistorySnapshot() );
        restoreHistorySnapshot( state.redoStack.pop() );
        updateHistoryButtons();
    }

    function loadImage( dataUrl ) {
        return new Promise( ( resolve, reject ) => {
            const image = new Image();
            image.onload = () => resolve( image );
            image.onerror = () => reject( new Error( 'Failed to load screenshot' ) );
            image.src = dataUrl;
        } );
    }

    function getCanvasPoint( event ) {
        const rect = state.visibleCanvas.getBoundingClientRect();
        const scaleX = state.backingCanvas.width / rect.width;
        const scaleY = state.backingCanvas.height / rect.height;

        return {
            x: Math.max( 0, Math.min( state.backingCanvas.width, ( event.clientX - rect.left ) * scaleX ) ),
            y: Math.max( 0, Math.min( state.backingCanvas.height, ( event.clientY - rect.top ) * scaleY ) )
        };
    }

    function normalizeRect( startPoint, endPoint ) {
        const x = Math.min( startPoint.x, endPoint.x );
        const y = Math.min( startPoint.y, endPoint.y );
        const width = Math.abs( endPoint.x - startPoint.x );
        const height = Math.abs( endPoint.y - startPoint.y );

        return { x, y, width, height };
    }

    function cloneRect( rect ) {
        return {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height
        };
    }

    function createEditId() {
        if ( typeof crypto !== 'undefined' && crypto.randomUUID ) return crypto.randomUUID();
        return `edit-${Date.now()}-${Math.random().toString( 36 ).slice( 2 )}`;
    }

    function getSelectedEdit() {
        return state.edits.find( edit => edit.id === state.selectedEditId );
    }

    function getEditableRectAtPoint( point ) {
        for ( let index = state.edits.length - 1; index >= 0; index-- ) {
            const edit = state.edits[ index ];
            if ( edit.kind !== 'rect' ) continue;
            const rect = edit.rect;
            if (
                point.x >= rect.x &&
                point.x <= rect.x + rect.width &&
                point.y >= rect.y &&
                point.y <= rect.y + rect.height
            ) {
                return edit;
            }
        }
        return null;
    }

    function getResizeHandles( rect ) {
        const centerX = rect.x + rect.width / 2;
        const centerY = rect.y + rect.height / 2;

        return [
            { name: 'nw', x: rect.x, y: rect.y },
            { name: 'n', x: centerX, y: rect.y },
            { name: 'ne', x: rect.x + rect.width, y: rect.y },
            { name: 'e', x: rect.x + rect.width, y: centerY },
            { name: 'se', x: rect.x + rect.width, y: rect.y + rect.height },
            { name: 's', x: centerX, y: rect.y + rect.height },
            { name: 'sw', x: rect.x, y: rect.y + rect.height },
            { name: 'w', x: rect.x, y: centerY }
        ];
    }

    function getResizeHandleAtPoint( point, edit ) {
        if ( !edit || edit.kind !== 'rect' ) return null;

        const hitSize = Math.max( 8, 10 / getVisibleScaleX() );
        return getResizeHandles( edit.rect ).find( handle => (
            Math.abs( point.x - handle.x ) <= hitSize &&
            Math.abs( point.y - handle.y ) <= hitSize
        ) )?.name || null;
    }

    function getVisibleScaleX() {
        return state.visibleCanvas && state.backingCanvas ? state.visibleCanvas.width / state.backingCanvas.width : 1;
    }

    function clampRectToCanvas( rect ) {
        const x = Math.max( 0, Math.min( rect.x, state.backingCanvas.width ) );
        const y = Math.max( 0, Math.min( rect.y, state.backingCanvas.height ) );
        const right = Math.max( 0, Math.min( rect.x + rect.width, state.backingCanvas.width ) );
        const bottom = Math.max( 0, Math.min( rect.y + rect.height, state.backingCanvas.height ) );

        return normalizeRect( { x, y }, { x: right, y: bottom } );
    }

    function resizeRect( startRect, startPoint, currentPoint, handle ) {
        const rect = cloneRect( startRect );
        const deltaX = currentPoint.x - startPoint.x;
        const deltaY = currentPoint.y - startPoint.y;

        if ( handle.includes( 'n' ) ) {
            rect.y += deltaY;
            rect.height -= deltaY;
        }
        if ( handle.includes( 's' ) ) rect.height += deltaY;
        if ( handle.includes( 'w' ) ) {
            rect.x += deltaX;
            rect.width -= deltaX;
        }
        if ( handle.includes( 'e' ) ) rect.width += deltaX;

        return clampRectToCanvas( normalizeRect(
            { x: rect.x, y: rect.y },
            { x: rect.x + rect.width, y: rect.y + rect.height }
        ) );
    }

    function renderVisibleCanvas() {
        if ( !state.visibleCanvas || !state.backingCanvas ) return;

        const devicePixelRatio = window.devicePixelRatio || 1;
        const availableCssWidth = Math.max( 320, state.visibleCanvas.parentElement.clientWidth );
        const maxCrispCssWidth = state.backingCanvas.width / devicePixelRatio;
        const cssWidth = Math.min( availableCssWidth, Math.max( 320, maxCrispCssWidth ) );
        const cssHeight = Math.round( state.backingCanvas.height * ( cssWidth / state.backingCanvas.width ) );
        const bitmapWidth = Math.round( cssWidth * devicePixelRatio );
        const bitmapHeight = Math.round( cssHeight * devicePixelRatio );

        state.visibleCanvas.width = bitmapWidth;
        state.visibleCanvas.height = bitmapHeight;
        state.visibleCanvas.style.width = `${cssWidth}px`;
        state.visibleCanvas.style.height = `${cssHeight}px`;
        state.visibleContext.imageSmoothingEnabled = true;
        state.visibleContext.imageSmoothingQuality = 'high';
        state.visibleContext.clearRect( 0, 0, state.visibleCanvas.width, state.visibleCanvas.height );
        state.visibleContext.drawImage( state.backingCanvas, 0, 0, state.visibleCanvas.width, state.visibleCanvas.height );
        drawSelectionOverlay();
        drawRectanglePreview();
    }

    function renderBackingCanvas() {
        if ( !state.backingContext || !state.image ) return;

        state.backingContext.clearRect( 0, 0, state.backingCanvas.width, state.backingCanvas.height );
        state.backingContext.drawImage( state.image, 0, 0 );

        for ( const edit of state.edits ) {
            if ( edit.kind === 'rect' ) {
                applyRectEdit( edit );
            } else if ( edit.kind === 'pen' ) {
                drawPenStroke( edit );
            }
        }
    }

    function drawSelectionOverlay() {
        const edit = getSelectedEdit();
        if ( !edit || edit.kind !== 'rect' ) return;

        const scaleX = state.visibleCanvas.width / state.backingCanvas.width;
        const scaleY = state.visibleCanvas.height / state.backingCanvas.height;
        const rect = edit.rect;
        const lineWidth = Math.max( 2, Math.round( window.devicePixelRatio || 1 ) );
        const x = rect.x * scaleX;
        const y = rect.y * scaleY;
        const width = rect.width * scaleX;
        const height = rect.height * scaleY;

        state.visibleContext.save();
        state.visibleContext.lineWidth = lineWidth;
        state.visibleContext.strokeStyle = '#38bdf8';
        state.visibleContext.setLineDash( [] );
        state.visibleContext.strokeRect( x + lineWidth / 2, y + lineWidth / 2, width - lineWidth, height - lineWidth );
        state.visibleContext.fillStyle = '#38bdf8';

        const handleSize = Math.max( 8, 8 * ( window.devicePixelRatio || 1 ) );
        for ( const handle of getResizeHandles( rect ) ) {
            const handleX = handle.x * scaleX - handleSize / 2;
            const handleY = handle.y * scaleY - handleSize / 2;
            state.visibleContext.fillRect( handleX, handleY, handleSize, handleSize );
        }

        state.visibleContext.restore();
    }

    function drawRectanglePreview() {
        if ( !state.isDrawing || state.tool === 'pen' || !state.startPoint || !state.previewPoint ) return;

        const rect = normalizeRect( state.startPoint, state.previewPoint );
        if ( rect.width < 2 || rect.height < 2 ) return;

        const scaleX = state.visibleCanvas.width / state.backingCanvas.width;
        const scaleY = state.visibleCanvas.height / state.backingCanvas.height;
        const lineWidth = Math.max( 2, Math.round( window.devicePixelRatio || 1 ) );
        const x = rect.x * scaleX;
        const y = rect.y * scaleY;
        const width = rect.width * scaleX;
        const height = rect.height * scaleY;

        state.visibleContext.save();
        state.visibleContext.setLineDash( [ 8, 5 ] );
        state.visibleContext.lineWidth = lineWidth;
        state.visibleContext.strokeStyle = state.tool === 'highlight' ? '#facc15' : '#38bdf8';
        state.visibleContext.strokeRect( x + lineWidth / 2, y + lineWidth / 2, width - lineWidth, height - lineWidth );
        state.visibleContext.restore();
    }

    function applyHighlight( rect ) {
        state.backingContext.fillStyle = HIGHLIGHT_COLOR;
        state.backingContext.fillRect( rect.x, rect.y, rect.width, rect.height );
    }

    function applyRectEdit( edit ) {
        if ( edit.tool === 'highlight' ) {
            applyHighlight( edit.rect );
        } else if ( edit.mode === 'blur' ) {
            applyBlur( edit.rect );
        } else {
            applyMosaic( edit.rect );
        }
    }

    function applyBlur( rect ) {
        const padding = BLUR_RADIUS_PX * 3;
        const sourceX = Math.max( 0, rect.x - padding );
        const sourceY = Math.max( 0, rect.y - padding );
        const sourceRight = Math.min( state.backingCanvas.width, rect.x + rect.width + padding );
        const sourceBottom = Math.min( state.backingCanvas.height, rect.y + rect.height + padding );
        const sourceWidth = sourceRight - sourceX;
        const sourceHeight = sourceBottom - sourceY;
        const offsetX = rect.x - sourceX;
        const offsetY = rect.y - sourceY;
        const tempCanvas = document.createElement( 'canvas' );
        tempCanvas.width = Math.max( 1, Math.round( sourceWidth ) );
        tempCanvas.height = Math.max( 1, Math.round( sourceHeight ) );
        const tempContext = tempCanvas.getContext( '2d' );

        tempContext.filter = `blur(${BLUR_RADIUS_PX}px)`;
        tempContext.drawImage(
            state.backingCanvas,
            sourceX,
            sourceY,
            sourceWidth,
            sourceHeight,
            0,
            0,
            tempCanvas.width,
            tempCanvas.height
        );
        state.backingContext.drawImage(
            tempCanvas,
            offsetX,
            offsetY,
            rect.width,
            rect.height,
            rect.x,
            rect.y,
            rect.width,
            rect.height
        );
    }

    function applyMosaic( rect ) {
        const smallWidth = Math.max( 1, Math.ceil( rect.width / MOSAIC_BLOCK_SIZE ) );
        const smallHeight = Math.max( 1, Math.ceil( rect.height / MOSAIC_BLOCK_SIZE ) );
        const tempCanvas = document.createElement( 'canvas' );
        tempCanvas.width = smallWidth;
        tempCanvas.height = smallHeight;
        const tempContext = tempCanvas.getContext( '2d' );

        tempContext.imageSmoothingEnabled = true;
        tempContext.drawImage(
            state.backingCanvas,
            rect.x,
            rect.y,
            rect.width,
            rect.height,
            0,
            0,
            smallWidth,
            smallHeight
        );

        state.backingContext.imageSmoothingEnabled = false;
        state.backingContext.drawImage( tempCanvas, 0, 0, smallWidth, smallHeight, rect.x, rect.y, rect.width, rect.height );
        state.backingContext.imageSmoothingEnabled = true;
    }

    function drawPenLine( fromPoint, toPoint ) {
        state.backingContext.strokeStyle = PEN_COLOR;
        state.backingContext.lineWidth = PEN_WIDTH;
        state.backingContext.lineCap = 'round';
        state.backingContext.lineJoin = 'round';
        state.backingContext.beginPath();
        state.backingContext.moveTo( fromPoint.x, fromPoint.y );
        state.backingContext.lineTo( toPoint.x, toPoint.y );
        state.backingContext.stroke();
    }

    function drawPenStroke( edit ) {
        if ( !Array.isArray( edit.points ) || edit.points.length < 2 ) return;

        state.backingContext.strokeStyle = edit.color || PEN_COLOR;
        state.backingContext.lineWidth = edit.width || PEN_WIDTH;
        state.backingContext.lineCap = 'round';
        state.backingContext.lineJoin = 'round';
        state.backingContext.beginPath();
        state.backingContext.moveTo( edit.points[ 0 ].x, edit.points[ 0 ].y );

        for ( const point of edit.points.slice( 1 ) ) {
            state.backingContext.lineTo( point.x, point.y );
        }

        state.backingContext.stroke();
    }

    function applyRectangleTool( endPoint ) {
        const rect = normalizeRect( state.startPoint, endPoint );
        if ( rect.width < 2 || rect.height < 2 ) return;

        pushHistory();
        const edit = {
            id: createEditId(),
            kind: 'rect',
            tool: state.tool,
            mode: state.tool === 'highlight' ? null : state.redactMode,
            rect
        };
        state.edits.push( edit );
        state.selectedEditId = edit.id;
        renderBackingCanvas();
        renderVisibleCanvas();
    }

    function resetCanvas() {
        if ( !state.image || !state.backingContext ) return;
        pushHistory();
        state.edits = [];
        state.selectedEditId = null;
        renderBackingCanvas();
        renderVisibleCanvas();
    }

    async function deleteTemporaryScreenshot() {
        if ( state.tempDeleted || !state.id ) return;
        await root.InfinityGauntletScreenshotStore.deleteTemporaryScreenshot( state.id );
        state.tempDeleted = true;
    }

    async function saveScreenshot() {
        const dataUrl = state.backingCanvas.toDataURL( 'image/png' );
        await chrome.downloads.download( {
            url: dataUrl,
            filename: getScreenshotFilename( state.title ),
            saveAs: false
        } );
        await deleteTemporaryScreenshot();
        setStatus( 'Saved.' );
    }

    async function cancelReview() {
        await deleteTemporaryScreenshot();
        window.close();
    }

    function handlePointerDown( event ) {
        if ( !state.backingCanvas ) return;
        state.visibleCanvas.setPointerCapture?.( event.pointerId );
        const point = getCanvasPoint( event );
        const selectedEdit = getSelectedEdit();
        const selectedHandle = getResizeHandleAtPoint( point, selectedEdit );
        const hitEdit = selectedHandle ? selectedEdit : getEditableRectAtPoint( point );

        if ( hitEdit ) {
            state.selectedEditId = hitEdit.id;
            state.activeInteraction = {
                type: selectedHandle ? 'resize' : 'move',
                editId: hitEdit.id,
                handle: selectedHandle,
                startPoint: point,
                startRect: cloneRect( hitEdit.rect ),
                didPushHistory: false
            };
            state.isDrawing = true;
            renderVisibleCanvas();
            return;
        }

        state.selectedEditId = null;
        state.isDrawing = true;
        state.startPoint = point;
        state.lastPoint = point;
        state.previewPoint = point;

        if ( state.tool === 'pen' ) {
            pushHistory();
            const penEdit = {
                id: createEditId(),
                kind: 'pen',
                color: PEN_COLOR,
                width: PEN_WIDTH,
                points: [ point ]
            };
            state.edits.push( penEdit );
            state.activeInteraction = {
                type: 'pen',
                editId: penEdit.id
            };
        } else {
            state.activeInteraction = {
                type: 'draw'
            };
        }
        renderVisibleCanvas();
    }

    function handlePointerMove( event ) {
        if ( !state.isDrawing ) return;
        const point = getCanvasPoint( event );
        const interaction = state.activeInteraction;

        if ( interaction?.type === 'move' || interaction?.type === 'resize' ) {
            const edit = state.edits.find( item => item.id === interaction.editId );
            if ( !edit ) return;

            if ( !interaction.didPushHistory ) {
                pushHistory();
                interaction.didPushHistory = true;
            }

            if ( interaction.type === 'move' ) {
                edit.rect = clampRectToCanvas( {
                    x: interaction.startRect.x + point.x - interaction.startPoint.x,
                    y: interaction.startRect.y + point.y - interaction.startPoint.y,
                    width: interaction.startRect.width,
                    height: interaction.startRect.height
                } );
            } else {
                edit.rect = resizeRect( interaction.startRect, interaction.startPoint, point, interaction.handle );
            }

            renderBackingCanvas();
            renderVisibleCanvas();
            return;
        }

        if ( interaction?.type === 'draw' ) {
            state.previewPoint = point;
            renderVisibleCanvas();
            return;
        }

        if ( interaction?.type === 'pen' ) {
            const edit = state.edits.find( item => item.id === interaction.editId );
            if ( !edit ) return;

            edit.points.push( point );
            renderBackingCanvas();
            renderVisibleCanvas();
        }
    }

    function handlePointerUp( event ) {
        if ( !state.isDrawing ) return;
        state.visibleCanvas.releasePointerCapture?.( event.pointerId );
        state.isDrawing = false;

        if ( state.activeInteraction?.type === 'draw' ) {
            applyRectangleTool( getCanvasPoint( event ) );
        }

        state.previewPoint = null;
        state.activeInteraction = null;
        renderVisibleCanvas();
    }

    async function initializeReview() {
        state.id = getScreenshotIdFromUrl();
        if ( !state.id ) {
            setStatus( 'Missing screenshot review id.' );
            return;
        }

        await root.InfinityGauntletScreenshotStore.deleteStaleTemporaryScreenshots();
        const record = await root.InfinityGauntletScreenshotStore.getTemporaryScreenshot( state.id );
        if ( !record ) {
            setStatus( 'Screenshot is no longer available.' );
            return;
        }

        state.title = record.title || 'Untitled Page';
        state.createdAt = record.createdAt || Date.now();
        state.dataUrl = record.dataUrl;
        setTitleText( state.title );

        state.image = await loadImage( state.dataUrl );
        state.visibleCanvas = document.getElementById( 'review-canvas' );
        state.visibleContext = state.visibleCanvas.getContext( '2d' );
        state.backingCanvas = document.createElement( 'canvas' );
        state.backingCanvas.width = state.image.naturalWidth || state.image.width;
        state.backingCanvas.height = state.image.naturalHeight || state.image.height;
        state.backingContext = state.backingCanvas.getContext( '2d' );
        state.backingContext.drawImage( state.image, 0, 0 );

        renderVisibleCanvas();
        setStatus( '' );
        updateHistoryButtons();
    }

    function setupEventListeners() {
        for ( const button of document.querySelectorAll( '[data-tool]' ) ) {
            button.addEventListener( 'click', () => {
                setActiveTool( button.dataset.tool );
                updateBlurWarning();
            } );
        }

        document.getElementById( 'redact-mode-toggle' )?.addEventListener( 'click', event => {
            event.stopPropagation();
            const menu = document.getElementById( 'redact-mode-menu' );
            setRedactMenuOpen( menu?.classList.contains( 'hidden' ) );
        } );
        for ( const item of document.querySelectorAll( '[data-redact-mode]' ) ) {
            item.addEventListener( 'click', event => {
                event.stopPropagation();
                setRedactMode( item.dataset.redactMode );
                setRedactMenuOpen( false );
            } );
        }
        document.addEventListener( 'click', () => setRedactMenuOpen( false ) );
        document.addEventListener( 'keydown', event => {
            if ( event.key === 'Escape' ) setRedactMenuOpen( false );
        } );
        const titleElement = document.getElementById( 'review-title' );
        titleElement?.addEventListener( 'click', beginTitleEdit );
        titleElement?.addEventListener( 'focus', beginTitleEdit );
        titleElement?.addEventListener( 'keydown', event => {
            if ( event.key === 'Enter' || event.key === ' ' ) {
                event.preventDefault();
                beginTitleEdit();
            }
        } );
        const titleInput = document.getElementById( 'review-title-input' );
        titleInput?.addEventListener( 'blur', finishTitleEdit );
        titleInput?.addEventListener( 'keydown', event => {
            if ( event.key === 'Enter' ) {
                event.preventDefault();
                titleInput.blur();
            }
            if ( event.key === 'Escape' ) {
                event.preventDefault();
                cancelTitleEdit();
            }
        } );
        document.getElementById( 'undo-button' )?.addEventListener( 'click', runUndo );
        document.getElementById( 'redo-button' )?.addEventListener( 'click', runRedo );
        document.getElementById( 'reset-button' )?.addEventListener( 'click', resetCanvas );
        document.getElementById( 'save-button' )?.addEventListener( 'click', () => saveScreenshot().catch( error => {
            console.error( 'Failed to save screenshot:', error );
            setStatus( 'Failed to save screenshot.' );
        } ) );
        document.getElementById( 'cancel-button' )?.addEventListener( 'click', () => cancelReview().catch( error => {
            console.error( 'Failed to cancel screenshot review:', error );
        } ) );

        const canvas = document.getElementById( 'review-canvas' );
        canvas?.addEventListener( 'pointerdown', handlePointerDown );
        canvas?.addEventListener( 'pointermove', handlePointerMove );
        canvas?.addEventListener( 'pointerup', handlePointerUp );
        canvas?.addEventListener( 'pointercancel', handlePointerUp );
        window.addEventListener( 'resize', renderVisibleCanvas );
        document.addEventListener( 'keydown', handleKeyboardShortcuts );
    }

    if ( typeof document !== 'undefined' ) {
        document.addEventListener( 'DOMContentLoaded', () => {
            setupEventListeners();
            initializeReview().catch( error => {
                console.error( 'Failed to initialize screenshot review:', error );
                setStatus( 'Failed to load screenshot.' );
            } );
        } );
    }

    const api = {
        MAX_HISTORY_STATES,
        getScreenshotFilename,
        sanitizeFilenamePart,
        normalizeRect,
        resizeRect,
        clampRectToCanvas,
        trimHistory,
        createCanvasSnapshot,
        updateBlurWarning,
        setActiveTool,
        setRedactMode,
        setRedactMenuOpen,
        persistTitleChange,
        handleKeyboardShortcuts,
        state
    };

    if ( typeof module !== 'undefined' && module.exports ) {
        module.exports = api;
    }
} )( typeof globalThis !== 'undefined' ? globalThis : window );
