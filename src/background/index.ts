/**
* When chrome extension icon is clicked, append a button to
* the DOM that when clicked sends an alert 'Hey WittCode!'
*/
let webSocket: WebSocket | null = null;

chrome.action.onClicked.addListener(async (tab: chrome.tabs.Tab) => {
    if (webSocket) {
        disconnect();
    } else {
        connect(tab);
        keepAlive();
    }
});

function connect(tab: chrome.tabs.Tab) {
    webSocket = new WebSocket(`ws://localhost:8000/ws?media_id=${tab.title}`);

    webSocket.onopen = () => {
        console.log('websocket connection opened');
    };

    webSocket.onmessage = (event) => {
        console.log(event.data);

        chrome.scripting.executeScript({
            func: () => {
                const myButton: HTMLButtonElement = document.createElement('button');
                myButton.textContent = "Button :)";
                myButton.onclick = () => {
                    alert('Testing!')
                }
                document.body.appendChild(myButton);
            },
            target: {
                tabId: tab.id || 0
            }
        });
    };

    webSocket.onclose = () => {
        console.log('websocket connection closed');
        webSocket = null;
    };
}

function disconnect() {
    if (webSocket) {
        webSocket.close();
    }
}

function keepAlive() {
    const keepAliveIntervalId = setInterval(() => {
        if (webSocket) {
            console.log('ping');
            webSocket.send('ping');
        } else {
            clearInterval(keepAliveIntervalId);
        }
    }, 5000);
}
