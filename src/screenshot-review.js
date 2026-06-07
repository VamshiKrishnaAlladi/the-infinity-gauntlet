( function( root ) {
    const MAX_HISTORY_STATES = 100;
    const PEN_COLOR = '#ef4444';
    const PEN_WIDTH = 6;
    const HIGHLIGHT_COLOR = 'rgba(250, 204, 21, 0.35)';
    const SOLID_REDACTION_COLOR = '#000000';
    const BLUR_RADIUS_PX = 28;
    const MOSAIC_BLOCK_SIZE = 12;
    const INCLUDE_TIMESTAMP_PREFERENCE_KEY = 'screenshotIncludeTimestamp';

    const state = {
        id: null,
        title: 'Untitled Page',
        createdAt: null,
        updatedAt: null,
        originalBlob: null,
        imageObjectUrl: null,
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
        includeTimestamp: true,
        toastTimeout: null,
        contextMenuEditId: null,
        autosaveTimeout: null,
        thumbnailTimeout: null,
        autosavePromise: null,
        thumbnailSavePromise: null,
        lastSavedDraft: null,
        navigationItems: []
    };
    const timeFormat = root.InfinityGauntletTimeFormat ||
        ( typeof require !== 'undefined' ? require( './utils/time-format' ) : null );

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

    function getScreenshotFilename( title, date = new Date(), includeTimestamp = true ) {
        const sanitizedTitle = sanitizeFilenamePart( title );
        if ( !includeTimestamp ) return `${sanitizedTitle}.png`;
        return `[${getLocalTimestampPrefix( date )}] ${sanitizedTitle}.png`;
    }

    function formatSavedAtMessage( timestamp = Date.now(), now = Date.now() ) {
        return `Saved - ${timeFormat.formatDisplayTimestamp( timestamp, now )}`;
    }

    function getScreenshotIdFromUrl() {
        return new URLSearchParams( window.location.search ).get( 'id' );
    }

    function updateTimestampCheckbox( includeTimestamp ) {
        const checkbox = document.getElementById( 'include-timestamp-checkbox' );
        if ( checkbox ) checkbox.checked = includeTimestamp;
    }

    async function loadIncludeTimestampPreference() {
        try {
            const result = await chrome.storage.local.get( [ INCLUDE_TIMESTAMP_PREFERENCE_KEY ] );
            state.includeTimestamp = result[ INCLUDE_TIMESTAMP_PREFERENCE_KEY ] !== false;
        } catch ( error ) {
            console.error( 'Failed to load timestamp preference:', error );
            state.includeTimestamp = true;
        }

        updateTimestampCheckbox( state.includeTimestamp );
        return state.includeTimestamp;
    }

    async function saveIncludeTimestampPreference( includeTimestamp ) {
        state.includeTimestamp = includeTimestamp;
        updateTimestampCheckbox( includeTimestamp );

        try {
            await chrome.storage.local.set( {
                [ INCLUDE_TIMESTAMP_PREFERENCE_KEY ]: includeTimestamp
            } );
        } catch ( error ) {
            console.error( 'Failed to save timestamp preference:', error );
            setStatus( 'Failed to save timestamp preference.' );
        }

        return includeTimestamp;
    }

    function setStatus( message ) {
        const status = document.getElementById( 'status-message' );
        if ( status ) status.textContent = message || '';
    }

    function showToast( message ) {
        const toast = document.getElementById( 'toast-message' );
        if ( !toast ) return;

        toast.textContent = message;
        toast.classList.remove( 'hidden' );
        clearTimeout( state.toastTimeout );
        state.toastTimeout = setTimeout( () => {
            toast.classList.add( 'hidden' );
        }, 2200 );
    }

    function createDraftSnapshot() {
        return JSON.stringify( {
            title: state.title,
            edits: state.edits
        } );
    }

    function hasDraftChanges() {
        return state.lastSavedDraft !== createDraftSnapshot();
    }

    function canvasToBlob( canvas ) {
        if ( canvas.toBlob ) {
            return new Promise( resolve => {
                canvas.toBlob( blob => {
                    resolve( blob || root.InfinityGauntletScreenshotStore.dataUrlToBlob( canvas.toDataURL( 'image/png' ) ) );
                }, 'image/png' );
            } );
        }

        return Promise.resolve( root.InfinityGauntletScreenshotStore.dataUrlToBlob( canvas.toDataURL( 'image/png' ) ) );
    }

    async function createThumbnailBlob() {
        const source = state.backingCanvas;
        if ( !source ) return null;

        const maxWidth = 420;
        const maxHeight = 260;
        const scale = Math.min( 1, maxWidth / source.width, maxHeight / source.height );
        const thumbnailCanvas = document.createElement( 'canvas' );
        thumbnailCanvas.width = Math.max( 1, Math.round( source.width * scale ) );
        thumbnailCanvas.height = Math.max( 1, Math.round( source.height * scale ) );
        const thumbnailContext = thumbnailCanvas.getContext( '2d' );
        thumbnailContext.imageSmoothingEnabled = true;
        thumbnailContext.imageSmoothingQuality = 'high';
        thumbnailContext.drawImage( source, 0, 0, thumbnailCanvas.width, thumbnailCanvas.height );
        return canvasToBlob( thumbnailCanvas );
    }

    async function saveThumbnail() {
        if ( !state.id || !state.backingCanvas ) return;
        const thumbnailBlob = await createThumbnailBlob();
        if ( !thumbnailBlob ) return;

        state.thumbnailSavePromise = root.InfinityGauntletScreenshotStore.updateScreenshotLibraryItem( state.id, {
            thumbnailBlob,
            updatedAt: state.updatedAt || Date.now()
        } ).catch( error => {
            console.error( 'Failed to update screenshot thumbnail:', error );
            setStatus( 'Draft saved, but thumbnail update failed.' );
        } ).finally( () => {
            state.thumbnailSavePromise = null;
        } );

        await state.thumbnailSavePromise;
    }

    function scheduleThumbnailRefresh() {
        clearTimeout( state.thumbnailTimeout );
        state.thumbnailTimeout = setTimeout( () => {
            state.thumbnailTimeout = null;
            saveThumbnail();
        }, 5000 );
    }

    async function saveDraft() {
        if ( !state.id || !hasDraftChanges() ) return null;
        if ( state.autosavePromise ) return state.autosavePromise;

        const snapshot = createDraftSnapshot();
        setStatus( 'Saving draft...' );
        state.autosavePromise = root.InfinityGauntletScreenshotStore.updateScreenshotLibraryItem( state.id, {
            title: state.title,
            edits: state.edits
        } ).then( item => {
            state.updatedAt = item.updatedAt;
            state.lastSavedDraft = snapshot;
            setStatus( formatSavedAtMessage( state.updatedAt ) );
            scheduleThumbnailRefresh();
            return item;
        } ).catch( error => {
            console.error( 'Failed to autosave screenshot draft:', error );
            setStatus( 'Failed to autosave draft.' );
            throw error;
        } ).finally( () => {
            state.autosavePromise = null;
        } );

        return state.autosavePromise;
    }

    function scheduleDraftAutosave() {
        if ( !state.id ) return;
        clearTimeout( state.autosaveTimeout );
        state.autosaveTimeout = setTimeout( () => {
            state.autosaveTimeout = null;
            saveDraft().catch( () => { } );
        }, 2000 );
    }

    async function flushDraftAutosave() {
        clearTimeout( state.autosaveTimeout );
        state.autosaveTimeout = null;
        if ( state.autosavePromise ) await state.autosavePromise;
        if ( hasDraftChanges() ) await saveDraft();
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
        scheduleDraftAutosave();

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
        if ( event.key === 'Delete' || event.key === 'Backspace' ) {
            event.preventDefault();
            removeSelectedEdit();
            return;
        }

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
            const label = mode === 'blur' ? 'Blur' : mode === 'solid' ? 'Solid' : 'Mosaic';
            toggle.title = `Redaction mode: ${label}`;
            toggle.setAttribute( 'aria-label', `Redaction mode: ${label}` );
        }

        updateBlurWarning();
    }

    function setRedactMenuOpen( isOpen ) {
        const menu = document.getElementById( 'redact-mode-menu' );
        const toggle = document.getElementById( 'redact-mode-toggle' );
        if ( menu ) menu.classList.toggle( 'hidden', !isOpen );
        if ( toggle ) toggle.setAttribute( 'aria-expanded', isOpen ? 'true' : 'false' );
    }

    function setEditContextMenuOpen( isOpen, x = 0, y = 0 ) {
        const menu = document.getElementById( 'edit-context-menu' );
        if ( !menu ) return;

        menu.classList.toggle( 'hidden', !isOpen );
        if ( !isOpen ) {
            state.contextMenuEditId = null;
            renderRedactionModeActions( null );
            return;
        }

        renderRedactionModeActions( state.edits.find( edit => edit.id === state.contextMenuEditId ) );
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
    }

    function getRedactionModeLabel( mode ) {
        if ( mode === 'blur' ) return 'Blur';
        if ( mode === 'solid' ) return 'Solid';
        return 'Mosaic';
    }

    function getAvailableRedactionModes( edit ) {
        if ( !edit || edit.kind !== 'rect' || edit.tool !== 'redact' ) return [];
        return [ 'mosaic', 'blur', 'solid' ].filter( mode => mode !== edit.mode );
    }

    function renderRedactionModeActions( edit ) {
        const container = document.getElementById( 'redaction-mode-actions' );
        if ( !container ) return;

        container.replaceChildren();
        for ( const mode of getAvailableRedactionModes( edit ) ) {
            const button = document.createElement( 'button' );
            button.type = 'button';
            button.className = 'edit-context-menu-item';
            button.dataset.contextRedactMode = mode;
            button.setAttribute( 'role', 'menuitem' );
            button.textContent = `Switch to ${getRedactionModeLabel( mode )}`;
            container.appendChild( button );
        }
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
        scheduleDraftAutosave();
    }

    async function redo() {
        if ( state.redoStack.length === 0 ) return;
        state.undoStack.push( createHistorySnapshot() );
        restoreHistorySnapshot( state.redoStack.pop() );
        updateHistoryButtons();
        scheduleDraftAutosave();
    }

    function loadImage( dataUrl ) {
        return new Promise( ( resolve, reject ) => {
            const image = new Image();
            image.onload = () => resolve( image );
            image.onerror = () => reject( new Error( 'Failed to load screenshot' ) );
            image.src = dataUrl;
        } );
    }

    async function getImageSourceFromBlob( blob ) {
        if ( root.URL?.createObjectURL ) {
            if ( state.imageObjectUrl ) root.URL.revokeObjectURL?.( state.imageObjectUrl );
            state.imageObjectUrl = root.URL.createObjectURL( blob );
            return state.imageObjectUrl;
        }

        return root.InfinityGauntletScreenshotStore.blobToDataUrl( blob );
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

    function removeSelectedEdit() {
        const editId = state.contextMenuEditId || state.selectedEditId;
        if ( !editId ) return false;

        const nextEdits = state.edits.filter( edit => edit.id !== editId );
        if ( nextEdits.length === state.edits.length ) return false;

        pushHistory();
        state.edits = nextEdits;
        if ( state.selectedEditId === editId ) state.selectedEditId = null;
        state.contextMenuEditId = null;
        setEditContextMenuOpen( false );
        renderBackingCanvas();
        renderVisibleCanvas();
        scheduleDraftAutosave();
        return true;
    }

    function changeSelectedRedactionMode( mode ) {
        const editId = state.contextMenuEditId || state.selectedEditId;
        const edit = state.edits.find( item => item.id === editId );
        if ( !edit || edit.kind !== 'rect' || edit.tool !== 'redact' || edit.mode === mode ) return false;

        pushHistory();
        edit.mode = mode;
        state.selectedEditId = edit.id;
        setEditContextMenuOpen( false );
        renderBackingCanvas();
        renderVisibleCanvas();
        scheduleDraftAutosave();
        return true;
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
        } else if ( edit.mode === 'solid' ) {
            applySolidRedaction( edit.rect );
        } else {
            applyMosaic( edit.rect );
        }
    }

    function applySolidRedaction( rect ) {
        state.backingContext.fillStyle = SOLID_REDACTION_COLOR;
        state.backingContext.fillRect( rect.x, rect.y, rect.width, rect.height );
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
        scheduleDraftAutosave();
    }

    function resetCanvas() {
        if ( !state.image || !state.backingContext ) return;
        pushHistory();
        state.edits = [];
        state.selectedEditId = null;
        renderBackingCanvas();
        renderVisibleCanvas();
        scheduleDraftAutosave();
    }

    async function exportScreenshot() {
        await flushDraftAutosave();
        const dataUrl = state.backingCanvas.toDataURL( 'image/png' );
        await chrome.downloads.download( {
            url: dataUrl,
            filename: getScreenshotFilename( state.title, new Date(), state.includeTimestamp ),
            saveAs: false
        } );
        showToast( 'Exported edited screenshot' );
    }

    async function closeReview() {
        await flushDraftAutosave();
        window.close();
    }

    function handlePointerDown( event ) {
        if ( !state.backingCanvas ) return;
        setEditContextMenuOpen( false );
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

    function handleCanvasContextMenu( event ) {
        if ( !state.backingCanvas ) return;

        event.preventDefault();
        const point = getCanvasPoint( event );
        const hitEdit = getEditableRectAtPoint( point );
        if ( !hitEdit ) {
            setEditContextMenuOpen( false );
            return;
        }

        state.selectedEditId = hitEdit.id;
        state.contextMenuEditId = hitEdit.id;
        renderVisibleCanvas();
        setEditContextMenuOpen( true, event.clientX, event.clientY );
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
        const interaction = state.activeInteraction;
        state.isDrawing = false;

        if ( interaction?.type === 'draw' ) {
            applyRectangleTool( getCanvasPoint( event ) );
        } else if ( interaction?.type === 'move' || interaction?.type === 'resize' || interaction?.type === 'pen' ) {
            scheduleDraftAutosave();
        }

        state.previewPoint = null;
        state.activeInteraction = null;
        renderVisibleCanvas();
    }

    async function refreshNavigationButtons() {
        if ( !state.id || !root.InfinityGauntletScreenshotStore?.listScreenshotLibraryItems ) return;

        state.navigationItems = await root.InfinityGauntletScreenshotStore.listScreenshotLibraryItems();
        const currentIndex = state.navigationItems.findIndex( item => item.id === state.id );
        const previousButton = document.getElementById( 'previous-button' );
        const nextButton = document.getElementById( 'next-button' );

        if ( previousButton ) previousButton.disabled = currentIndex <= 0;
        if ( nextButton ) nextButton.disabled = currentIndex < 0 || currentIndex >= state.navigationItems.length - 1;
    }

    async function navigateAdjacentScreenshot( direction ) {
        await flushDraftAutosave();
        await refreshNavigationButtons();

        const currentIndex = state.navigationItems.findIndex( item => item.id === state.id );
        const nextIndex = currentIndex + direction;
        const nextItem = state.navigationItems[ nextIndex ];
        if ( !nextItem ) return;

        window.location.href = `${window.location.pathname}?id=${encodeURIComponent( nextItem.id )}`;
    }

    async function initializeReview() {
        state.id = getScreenshotIdFromUrl();
        if ( !state.id ) {
            setStatus( 'Missing screenshot review id.' );
            return;
        }

        const record = await root.InfinityGauntletScreenshotStore.getScreenshotLibraryItem( state.id );
        if ( !record ) {
            setStatus( 'Screenshot is no longer available.' );
            return;
        }

        state.title = record.title || 'Untitled Page';
        state.createdAt = record.createdAt || Date.now();
        state.updatedAt = record.updatedAt || state.createdAt;
        state.originalBlob = record.originalBlob;
        state.edits = Array.isArray( record.edits ) ? record.edits : [];
        state.lastSavedDraft = createDraftSnapshot();
        setTitleText( state.title );
        await loadIncludeTimestampPreference();

        state.image = await loadImage( await getImageSourceFromBlob( state.originalBlob ) );
        state.visibleCanvas = document.getElementById( 'review-canvas' );
        state.visibleContext = state.visibleCanvas.getContext( '2d' );
        state.backingCanvas = document.createElement( 'canvas' );
        state.backingCanvas.width = state.image.naturalWidth || state.image.width;
        state.backingCanvas.height = state.image.naturalHeight || state.image.height;
        state.backingContext = state.backingCanvas.getContext( '2d' );
        state.backingContext.drawImage( state.image, 0, 0 );
        renderBackingCanvas();

        renderVisibleCanvas();
        setStatus( '' );
        updateHistoryButtons();
        await refreshNavigationButtons();
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
        document.addEventListener( 'click', () => setEditContextMenuOpen( false ) );
        document.addEventListener( 'keydown', event => {
            if ( event.key === 'Escape' ) setEditContextMenuOpen( false );
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
        document.getElementById( 'remove-edit-button' )?.addEventListener( 'click', removeSelectedEdit );
        document.getElementById( 'redaction-mode-actions' )?.addEventListener( 'click', event => {
            const mode = event.target?.dataset?.contextRedactMode;
            if ( mode ) changeSelectedRedactionMode( mode );
        } );
        document.getElementById( 'include-timestamp-checkbox' )?.addEventListener( 'change', event => {
            saveIncludeTimestampPreference( event.target.checked );
        } );
        document.getElementById( 'export-button' )?.addEventListener( 'click', () => exportScreenshot().catch( error => {
            console.error( 'Failed to export screenshot:', error );
            setStatus( 'Failed to export screenshot.' );
        } ) );
        document.getElementById( 'close-button' )?.addEventListener( 'click', () => closeReview().catch( error => {
            console.error( 'Failed to close screenshot review:', error );
        } ) );
        document.getElementById( 'previous-button' )?.addEventListener( 'click', () => navigateAdjacentScreenshot( -1 ).catch( error => {
            console.error( 'Failed to open previous screenshot:', error );
            setStatus( 'Failed to open previous screenshot.' );
        } ) );
        document.getElementById( 'next-button' )?.addEventListener( 'click', () => navigateAdjacentScreenshot( 1 ).catch( error => {
            console.error( 'Failed to open next screenshot:', error );
            setStatus( 'Failed to open next screenshot.' );
        } ) );

        const canvas = document.getElementById( 'review-canvas' );
        canvas?.addEventListener( 'pointerdown', handlePointerDown );
        canvas?.addEventListener( 'pointermove', handlePointerMove );
        canvas?.addEventListener( 'pointerup', handlePointerUp );
        canvas?.addEventListener( 'pointercancel', handlePointerUp );
        canvas?.addEventListener( 'contextmenu', handleCanvasContextMenu );
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
        formatSavedAtMessage,
        formatDisplayTimestamp: timeFormat.formatDisplayTimestamp,
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
        removeSelectedEdit,
        changeSelectedRedactionMode,
        getAvailableRedactionModes,
        loadIncludeTimestampPreference,
        saveIncludeTimestampPreference,
        handleKeyboardShortcuts,
        scheduleDraftAutosave,
        flushDraftAutosave,
        exportScreenshot,
        closeReview,
        createDraftSnapshot,
        refreshNavigationButtons,
        navigateAdjacentScreenshot,
        state
    };

    if ( typeof module !== 'undefined' && module.exports ) {
        module.exports = api;
    }
} )( typeof globalThis !== 'undefined' ? globalThis : window );
