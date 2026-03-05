require( '../src/utils/ui-helpers' );

global.chrome = {
    storage: {
        sync: {
            get: jest.fn(),
            set: jest.fn()
        },
        local: {
            get: jest.fn(),
            set: jest.fn()
        }
    },
    runtime: {
        sendMessage: jest.fn(),
        onMessage: {
            addListener: jest.fn()
        },
        lastError: null
    },
    webNavigation: {
        onBeforeNavigate: {
            addListener: jest.fn()
        }
    },
    tabs: {
        update: jest.fn(),
        query: jest.fn(),
        create: jest.fn()
    },
    action: {
        setBadgeText: jest.fn(),
        setBadgeBackgroundColor: jest.fn()
    }
};

beforeEach( () => {
    jest.clearAllMocks();
} );
