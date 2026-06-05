( function( root ) {
    const DB_NAME = 'infinityGauntletScreenshots';
    const DB_VERSION = 1;
    const STORE_NAME = 'temporaryScreenshots';
    const STALE_SCREENSHOT_AGE_MS = 24 * 60 * 60 * 1000;
    const memoryStore = new Map();

    function hasIndexedDB() {
        return typeof indexedDB !== 'undefined';
    }

    function openDatabase() {
        if ( !hasIndexedDB() ) return Promise.resolve( null );

        return new Promise( ( resolve, reject ) => {
            const request = indexedDB.open( DB_NAME, DB_VERSION );

            request.onupgradeneeded = () => {
                const database = request.result;
                if ( !database.objectStoreNames.contains( STORE_NAME ) ) {
                    database.createObjectStore( STORE_NAME, { keyPath: 'id' } );
                }
            };
            request.onsuccess = () => resolve( request.result );
            request.onerror = () => reject( request.error );
        } );
    }

    async function withStore( mode, callback ) {
        const database = await openDatabase();
        if ( !database ) return callback( null );

        return new Promise( ( resolve, reject ) => {
            const transaction = database.transaction( STORE_NAME, mode );
            const store = transaction.objectStore( STORE_NAME );
            let callbackResult;

            transaction.oncomplete = () => {
                database.close();
                resolve( callbackResult );
            };
            transaction.onerror = () => {
                database.close();
                reject( transaction.error );
            };

            callbackResult = callback( store );
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

    async function putTemporaryScreenshot( { id = createScreenshotId(), dataUrl, title, createdAt = Date.now() } ) {
        const record = { id, dataUrl, title: title || 'Untitled Page', createdAt };

        await withStore( 'readwrite', store => {
            if ( !store ) {
                memoryStore.set( id, record );
                return undefined;
            }
            store.put( record );
            return undefined;
        } );

        return record;
    }

    async function getTemporaryScreenshot( id ) {
        return withStore( 'readonly', store => {
            if ( !store ) return memoryStore.get( id );
            return requestToPromise( store.get( id ) );
        } );
    }

    async function deleteTemporaryScreenshot( id ) {
        await withStore( 'readwrite', store => {
            if ( !store ) {
                memoryStore.delete( id );
                return undefined;
            }
            store.delete( id );
            return undefined;
        } );
    }

    async function deleteStaleTemporaryScreenshots( now = Date.now(), maxAgeMs = STALE_SCREENSHOT_AGE_MS ) {
        const cutoff = now - maxAgeMs;
        let deletedCount = 0;

        await withStore( 'readwrite', store => {
            if ( !store ) {
                for ( const [ id, record ] of memoryStore.entries() ) {
                    if ( record.createdAt < cutoff ) {
                        memoryStore.delete( id );
                        deletedCount++;
                    }
                }
                return undefined;
            }

            const request = store.openCursor();
            request.onsuccess = () => {
                const cursor = request.result;
                if ( !cursor ) return;

                if ( cursor.value.createdAt < cutoff ) {
                    cursor.delete();
                    deletedCount++;
                }
                cursor.continue();
            };
            return undefined;
        } );

        return deletedCount;
    }

    const api = {
        putTemporaryScreenshot,
        getTemporaryScreenshot,
        deleteTemporaryScreenshot,
        deleteStaleTemporaryScreenshots,
        createScreenshotId,
        STALE_SCREENSHOT_AGE_MS
    };

    root.InfinityGauntletScreenshotStore = api;

    if ( typeof module !== 'undefined' && module.exports ) {
        module.exports = api;
    }
} )( typeof globalThis !== 'undefined' ? globalThis : window );
