const { formatDuration, sendMessageWithRetry } = require( '../../src/utils/ui-helpers' );

describe( 'UI Helpers Module', () => {
    describe( 'formatDuration', () => {
        it( 'should format seconds correctly', () => {
            expect( formatDuration( 30 ) ).toBe( '30 seconds' );
            expect( formatDuration( 1 ) ).toBe( '1 second' );
        } );

        it( 'should format minutes correctly', () => {
            expect( formatDuration( 60 ) ).toBe( '1 minute' );
            expect( formatDuration( 120 ) ).toBe( '2 minutes' );
        } );

        it( 'should format minutes and seconds correctly', () => {
            expect( formatDuration( 90 ) ).toBe( '1 min 30 sec' );
            expect( formatDuration( 125 ) ).toBe( '2 min 5 sec' );
        } );
    } );

    describe( 'sendMessageWithRetry', () => {
        it( 'should retry on connection error', async () => {
            chrome.runtime.sendMessage
                .mockRejectedValueOnce( new Error( 'Could not establish connection' ) )
                .mockRejectedValueOnce( new Error( 'Could not establish connection' ) )
                .mockResolvedValueOnce( { success: true } );

            const result = await sendMessageWithRetry( { type: 'test' } );

            expect( result ).toEqual( { success: true } );
            expect( chrome.runtime.sendMessage ).toHaveBeenCalledTimes( 3 );
        } );

        it( 'should throw error after max retries', async () => {
            chrome.runtime.sendMessage.mockRejectedValue(
                new Error( 'Could not establish connection' )
            );

            await expect( sendMessageWithRetry( { type: 'test' } ) ).rejects.toThrow(
                'Could not establish connection'
            );

            expect( chrome.runtime.sendMessage ).toHaveBeenCalledTimes( 4 );
        } );

        it( 'should not retry on other errors', async () => {
            chrome.runtime.sendMessage.mockRejectedValue( new Error( 'Other error' ) );

            await expect( sendMessageWithRetry( { type: 'test' } ) ).rejects.toThrow(
                'Other error'
            );

            expect( chrome.runtime.sendMessage ).toHaveBeenCalledTimes( 1 );
        } );
    } );
} );
