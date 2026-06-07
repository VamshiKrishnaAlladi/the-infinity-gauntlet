( function( root ) {
    const DB_NAME = 'infinityGauntletScreenshots';
    const DB_VERSION = 2;
    const LIBRARY_STORE_NAME = 'screenshotLibraryItems';
    const TEMPORARY_STORE_NAME = 'temporaryScreenshots';
    const STALE_SCREENSHOT_AGE_MS = 24 * 60 * 60 * 1000;
    const memoryLibraryStore = new Map();

    function hasIndexedDB() {
        return typeof indexedDB !== 'undefined';
    }

    function hasStore( database, storeName ) {
        return database.objectStoreNames.contains( storeName );
    }

    function openDatabase() {
        if ( !hasIndexedDB() ) return Promise.resolve( null );

        return new Promise( ( resolve, reject ) => {
            const request = indexedDB.open( DB_NAME, DB_VERSION );

            request.onupgradeneeded = () => {
                const database = request.result;
                if ( !hasStore( database, TEMPORARY_STORE_NAME ) ) {
                    database.createObjectStore( TEMPORARY_STORE_NAME, { keyPath: 'id' } );
                }
                if ( !hasStore( database, LIBRARY_STORE_NAME ) ) {
                    const libraryStore = database.createObjectStore( LIBRARY_STORE_NAME, { keyPath: 'id' } );
                    libraryStore.createIndex( 'updatedAt', 'updatedAt', { unique: false } );
                    libraryStore.createIndex( 'title', 'title', { unique: false } );
                }
            };
            request.onsuccess = () => resolve( request.result );
            request.onerror = () => reject( request.error );
        } );
    }

    async function withStore( storeName, mode, callback ) {
        const database = await openDatabase();
        if ( !database ) return callback( null );

        return new Promise( ( resolve, reject ) => {
            const transaction = database.transaction( storeName, mode );
            const store = transaction.objectStore( storeName );
            let callbackResult;
            let callbackError;

            transaction.oncomplete = () => {
                database.close();
                if ( callbackError ) {
                    reject( callbackError );
                    return;
                }
                Promise.resolve( callbackResult ).then( resolve, reject );
            };
            transaction.onerror = () => {
                database.close();
                reject( transaction.error );
            };
            transaction.onabort = () => {
                database.close();
                reject( transaction.error || callbackError || new Error( 'Screenshot library transaction was aborted' ) );
            };

            try {
                callbackResult = callback( store );
                Promise.resolve( callbackResult ).catch( error => {
                    callbackError = error;
                    transaction.abort();
                } );
            } catch ( error ) {
                callbackError = error;
                transaction.abort();
            }
        } );
    }

    function requestToPromise( request ) {
        return new Promise( ( resolve, reject ) => {
            request.onsuccess = () => resolve( request.result );
            request.onerror = () => reject( request.error );
        } );
    }

    function createScreenshotId() {
        if ( typeof crypto !== 'undefined' && crypto.randomUUID ) return crypto.randomUUID();
        return `${Date.now()}-${Math.random().toString( 36 ).slice( 2 )}`;
    }

    function normalizeTitle( title ) {
        return ( title || 'Untitled Page' ).replace( /\s+/g, ' ' ).trim() || 'Untitled Page';
    }

    function cloneEdits( edits ) {
        return JSON.parse( JSON.stringify( Array.isArray( edits ) ? edits : [] ) );
    }

    function estimateBlobBytes( blob ) {
        if ( blob && typeof blob.size === 'number' ) return blob.size;
        if ( typeof blob === 'string' ) return blob.length;
        return 0;
    }

    function estimateMetadataBytes( item ) {
        return JSON.stringify( {
            id: item.id,
            title: item.title,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
            edits: item.edits || []
        } ).length;
    }

    function updateItemByteCounts( item ) {
        item.originalBytes = estimateBlobBytes( item.originalBlob );
        item.thumbnailBytes = estimateBlobBytes( item.thumbnailBlob );
        item.metadataBytes = estimateMetadataBytes( item );
        item.totalBytes = item.originalBytes + item.thumbnailBytes + item.metadataBytes;
        return item;
    }

    function dataUrlToBlob( dataUrl ) {
        if ( typeof dataUrl !== 'string' || !dataUrl.includes( ',' ) ) {
            throw new Error( 'Invalid screenshot data URL' );
        }

        const [ header, payload ] = dataUrl.split( ',' );
        const mimeMatch = header.match( /data:([^;]+)/ );
        const mimeType = mimeMatch ? mimeMatch[ 1 ] : 'application/octet-stream';
        const isBase64 = header.includes( ';base64' );
        let bytes;

        if ( isBase64 ) {
            let binary;
            try {
                binary = typeof atob === 'function'
                    ? atob( payload )
                    : Buffer.from( payload, 'base64' ).toString( 'binary' );
            } catch {
                binary = typeof Buffer !== 'undefined'
                    ? Buffer.from( payload, 'base64' ).toString( 'binary' )
                    : payload;
            }
            bytes = new Uint8Array( binary.length );
            for ( let index = 0; index < binary.length; index++ ) {
                bytes[ index ] = binary.charCodeAt( index );
            }
        } else {
            bytes = new TextEncoder().encode( decodeURIComponent( payload ) );
        }

        return new Blob( [ bytes ], { type: mimeType } );
    }

    function arrayBufferToBase64( buffer ) {
        if ( typeof Buffer !== 'undefined' ) return Buffer.from( buffer ).toString( 'base64' );

        const bytes = new Uint8Array( buffer );
        let binary = '';
        for ( const byte of bytes ) {
            binary += String.fromCharCode( byte );
        }
        return btoa( binary );
    }

    function blobToDataUrl( blob ) {
        if ( typeof blob === 'string' ) return Promise.resolve( blob );
        if ( !blob ) return Promise.resolve( '' );

        if ( typeof FileReader !== 'undefined' ) {
            return new Promise( ( resolve, reject ) => {
                const reader = new FileReader();
                reader.onload = () => resolve( reader.result );
                reader.onerror = () => reject( reader.error );
                reader.readAsDataURL( blob );
            } );
        }

        return blob.arrayBuffer().then( buffer => {
            const mimeType = blob.type || 'application/octet-stream';
            return `data:${mimeType};base64,${arrayBufferToBase64( buffer )}`;
        } );
    }

    function coerceBlob( { blob, dataUrl } ) {
        if ( blob ) return blob;
        if ( dataUrl ) return dataUrlToBlob( dataUrl );
        return null;
    }

    function cloneLibraryItem( item ) {
        if ( !item ) return null;
        return {
            ...item,
            edits: cloneEdits( item.edits )
        };
    }

    async function createScreenshotLibraryItem( {
        id = createScreenshotId(),
        title,
        originalBlob,
        dataUrl,
        thumbnailBlob,
        thumbnailDataUrl,
        edits = [],
        createdAt = Date.now(),
        updatedAt = createdAt
    } ) {
        const original = coerceBlob( { blob: originalBlob, dataUrl } );
        if ( !original ) throw new Error( 'Screenshot image is required' );

        const thumbnail = coerceBlob( { blob: thumbnailBlob, dataUrl: thumbnailDataUrl } ) || original;
        const record = updateItemByteCounts( {
            id,
            title: normalizeTitle( title ),
            createdAt,
            updatedAt,
            originalBlob: original,
            thumbnailBlob: thumbnail,
            edits: cloneEdits( edits )
        } );

        await withStore( LIBRARY_STORE_NAME, 'readwrite', store => {
            if ( !store ) {
                memoryLibraryStore.set( id, record );
                return undefined;
            }
            store.put( record );
            return undefined;
        } );

        return cloneLibraryItem( record );
    }

    async function getScreenshotLibraryItem( id ) {
        return withStore( LIBRARY_STORE_NAME, 'readonly', async store => {
            if ( !store ) return cloneLibraryItem( memoryLibraryStore.get( id ) );
            return cloneLibraryItem( await requestToPromise( store.get( id ) ) );
        } );
    }

    async function listScreenshotLibraryItems( { search = '' } = {} ) {
        const normalizedSearch = search.toLowerCase().trim();
        const records = await withStore( LIBRARY_STORE_NAME, 'readonly', async store => {
            if ( !store ) return Array.from( memoryLibraryStore.values() ).map( cloneLibraryItem );
            return ( await requestToPromise( store.getAll() ) ).map( cloneLibraryItem );
        } );

        return records
            .filter( item => !normalizedSearch || item.title.toLowerCase().includes( normalizedSearch ) )
            .sort( ( a, b ) => ( b.updatedAt || 0 ) - ( a.updatedAt || 0 ) || ( b.createdAt || 0 ) - ( a.createdAt || 0 ) );
    }

    async function updateScreenshotLibraryItem( id, updates = {} ) {
        const updatedItem = await withStore( LIBRARY_STORE_NAME, 'readwrite', async store => {
            const current = store
                ? await requestToPromise( store.get( id ) )
                : memoryLibraryStore.get( id );

            if ( !current ) return null;

            const next = {
                ...current
            };
            const updatesDraftContent = Object.prototype.hasOwnProperty.call( updates, 'title' ) ||
                Object.prototype.hasOwnProperty.call( updates, 'edits' );

            if ( Object.prototype.hasOwnProperty.call( updates, 'title' ) ) {
                next.title = normalizeTitle( updates.title );
            }
            if ( Object.prototype.hasOwnProperty.call( updates, 'edits' ) ) {
                next.edits = cloneEdits( updates.edits );
            }
            if ( updates.originalBlob || updates.dataUrl ) {
                next.originalBlob = coerceBlob( { blob: updates.originalBlob, dataUrl: updates.dataUrl } );
            }
            if ( updates.thumbnailBlob || updates.thumbnailDataUrl ) {
                next.thumbnailBlob = coerceBlob( {
                    blob: updates.thumbnailBlob,
                    dataUrl: updates.thumbnailDataUrl
                } );
            }

            if ( typeof updates.updatedAt === 'number' ) {
                next.updatedAt = updates.updatedAt;
            } else if ( updatesDraftContent ) {
                next.updatedAt = Date.now();
            }

            updateItemByteCounts( next );

            if ( store ) {
                store.put( next );
            } else {
                memoryLibraryStore.set( id, next );
            }
            return cloneLibraryItem( next );
        } );

        if ( !updatedItem ) throw new Error( 'Screenshot library item not found' );
        return updatedItem;
    }

    async function deleteScreenshotLibraryItem( id ) {
        await withStore( LIBRARY_STORE_NAME, 'readwrite', store => {
            if ( !store ) {
                memoryLibraryStore.delete( id );
                return undefined;
            }
            store.delete( id );
            return undefined;
        } );
    }

    async function getScreenshotLibraryUsage() {
        const items = await listScreenshotLibraryItems();
        const trackedBytes = items.reduce( ( total, item ) => total + ( item.totalBytes || 0 ), 0 );
        let quotaEstimate = null;

        if ( root.navigator?.storage?.estimate ) {
            try {
                quotaEstimate = await root.navigator.storage.estimate();
            } catch {
                quotaEstimate = null;
            }
        }

        return {
            itemCount: items.length,
            trackedBytes,
            quota: quotaEstimate?.quota || null,
            usage: quotaEstimate?.usage || null
        };
    }

    async function putTemporaryScreenshot( { id = createScreenshotId(), dataUrl, title, createdAt = Date.now() } ) {
        return createScreenshotLibraryItem( {
            id,
            dataUrl,
            title,
            createdAt,
            updatedAt: createdAt
        } );
    }

    async function getTemporaryScreenshot( id ) {
        const item = await getScreenshotLibraryItem( id );
        if ( !item ) return undefined;

        return {
            id: item.id,
            dataUrl: await blobToDataUrl( item.originalBlob ),
            title: item.title,
            createdAt: item.createdAt
        };
    }

    async function deleteTemporaryScreenshot( id ) {
        return deleteScreenshotLibraryItem( id );
    }

    async function deleteStaleTemporaryScreenshots() {
        return 0;
    }

    function __clearMemoryScreenshotLibrary() {
        memoryLibraryStore.clear();
    }

    const api = {
        createScreenshotLibraryItem,
        getScreenshotLibraryItem,
        listScreenshotLibraryItems,
        updateScreenshotLibraryItem,
        deleteScreenshotLibraryItem,
        getScreenshotLibraryUsage,
        putTemporaryScreenshot,
        getTemporaryScreenshot,
        deleteTemporaryScreenshot,
        deleteStaleTemporaryScreenshots,
        createScreenshotId,
        dataUrlToBlob,
        blobToDataUrl,
        estimateBlobBytes,
        STALE_SCREENSHOT_AGE_MS,
        __clearMemoryScreenshotLibrary
    };

    root.InfinityGauntletScreenshotStore = api;

    if ( typeof module !== 'undefined' && module.exports ) {
        module.exports = api;
    }
} )( typeof globalThis !== 'undefined' ? globalThis : window );
