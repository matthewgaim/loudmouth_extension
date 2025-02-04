let webSocket: WebSocket | null = null;
let all_comments: IncomingComment[] = []; // to prevent showing duplicates
let WEBSOCKET_URL = "eg8sskkgog884g44ks8ggosw.getaroomy.com";

type IncomingComment = {
    comment_id: number;
    message: string;
    poster: string;
    time_of_media: number;
    created_at: Date;
};

type OutgoingComment = {
    message: string;
    poster: string;
    time_of_media: number;
    media_id: string;
};

chrome.action.onClicked.addListener(async (tab: chrome.tabs.Tab) => {
    if(webSocket){
        disconnect();
        deleteLoudmouthHTML(tab);
    } else {
        connect(tab);
        keepAlive(tab);
    }
});

chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
    if (message.type === 'SEND_COMMENT' && webSocket) {
        webSocket.send(JSON.stringify(message.data));
    }
});

/** Get video ID from given URL (currently just from Netflix) */
function getMediaId(url: string): string {
    const match = url.match(/https:\/\/www\.netflix\.com\/watch\/(\d+)/);
    return match ? match[1] : "TEMPORARY_MEDIA_ID"; // Placeholder for non-Netflix URLs
}

function getUsername(): Promise<string> {
    return new Promise((resolve) => {
        chrome.storage.sync.get(['loudmouth_username'], (items) => {
            resolve(items["loudmouth_username"] || "");
        });
    });
}

async function setUsername() {
    const name = prompt("Enter a username:") || "Yapper";
    await chrome.storage.sync.set({ 'loudmouth_username': name });
    console.log('Username saved');
}

async function connect(tab: chrome.tabs.Tab) {
    if (!tab.url) {
        alert("You're not on any tab");
        return;
    }

    const media_id = getMediaId(tab.url);
    webSocket = new WebSocket(`wss://${WEBSOCKET_URL}/ws?media_id=${media_id}`);

    webSocket.onopen = async () => {
        console.log('WebSocket connection opened');
        const username = await getUsername();
        if (username === "")  setUsername();
        console.log("Logged in as", username);
        createSidebar(tab, media_id, username);
    };

    webSocket.onmessage = (event) => handleIncomingMessages(event, tab);
    webSocket.onclose = () => handleDisconnect(tab);
}

function createSidebar(tab: chrome.tabs.Tab, media_id: string, username: string) {
    chrome.scripting.executeScript({
        args: [media_id, username],
        func: (media_id, username) => {
            const loudmouthSidebarHTML = `
                <style>
                    .loudmouth { background: #f5f5f5; border-radius: 4px; padding: 16px; font-family: Arial, sans-serif; color: #000; max-width: 400px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1); position: absolute; }
                    .loudmouth-comments { margin-bottom: 16px; max-height: 300px; overflow-y: auto; }
                    .comment-row { padding: 8px 0; border-bottom: 1px solid #e0e0e0; }
                    .comment-content { margin: 0; font-size: 14px; line-height: 1.4; }
                    .comment-metadata { color: #666; font-size: 12px; margin-top: 4px; }
                    .comment-user { color: #1a73e8; font-weight: 500; }
                    .loudmouth-form { display: flex; gap: 8px; }
                    .loudmouth-input { flex: 1; background: #fff; border: 1px solid #ccc; border-radius: 4px; padding: 8px 12px; color: #000; font-size: 14px; transition: border-color 0.2s ease; }
                    .loudmouth-input:focus { outline: none; border-color: #1a73e8; }
                    .loudmouth-submit { background: #1a73e8; color: white; border: none; border-radius: 4px; padding: 8px 16px; font-size: 14px; font-weight: 500; cursor: pointer; transition: background 0.2s ease; }
                    .loudmouth-submit:hover { background: #185abc; }
                </style>
                <div class="loudmouth">
                    <div id="loudmouth_comments" class="loudmouth-comments"></div>
                    <form id="loudmouth_comment_form" class="loudmouth-form">
                        <input id="loudmouth_comment_input" class="loudmouth-input" type="text" placeholder="Add a comment...">
                        <button id="loudmouth_comment_form_submit_btn" class="loudmouth-submit" type="submit">Post</button>
                    </form>
                </div>
            `;
            
            document.body.insertAdjacentHTML("beforeend", loudmouthSidebarHTML);
            document.getElementById('loudmouth_comment_form')?.addEventListener('submit', (e) => {
                e.preventDefault();
                const inputElement = document.getElementById('loudmouth_comment_input') as HTMLInputElement;
                const commentText = inputElement.value;
                
                const script = document.createElement('script');
                script.src = chrome.runtime.getURL('src/background/inject.js');
                document.documentElement.appendChild(script);

                // Listen for the message with the playback time
                window.addEventListener('message', (event) => {
                    if (event.source !== window || event.data.type !== 'LOUDMOUTH_NETFLIX_TIME') return;
                    const time_of_media = event.data.time || 0;

                    chrome.runtime.sendMessage({
                        type: 'SEND_COMMENT',
                        data: {
                            message: commentText,
                            poster: username,
                            time_of_media,
                            media_id
                        }
                    });
                }, { once: true });

                script.remove(); // Clean up the injected script
                
            });
        },
        target: { tabId: tab.id || 0 }
    });
    
}

function handleIncomingMessages(event: MessageEvent, tab: chrome.tabs.Tab) {
    const incoming_msgs: IncomingComment[] = JSON.parse(event.data);
    const newMessages = incoming_msgs.filter((incoming_msg) =>
        !all_comments.some((existing_msg) => existing_msg.comment_id === incoming_msg.comment_id)
    );

    all_comments = [...all_comments, ...newMessages];
    addCommentsInDOM(newMessages, tab);
}

function addCommentsInDOM(messages: IncomingComment[], tab: chrome.tabs.Tab) {
    chrome.scripting.executeScript({
        args: [messages],
        func: (messages) => {
            const commentsContainer = document.getElementById('loudmouth_comments');
            messages.forEach((messageData) => {
                const div = document.createElement('div');
                div.className = 'comment-row';
                div.id = messageData.comment_id.toString();
                div.innerHTML = `
                    <p class="comment-content">
                        <span class="comment-user">${messageData.poster}</span>
                        ${messageData.message}
                    </p>
                    <div class="comment-metadata">${messageData.time_of_media}</div>
                `;
                commentsContainer?.appendChild(div);
            });
        },
        target: { tabId: tab.id || 0 }
    });
}

function handleDisconnect(tab: chrome.tabs.Tab) {
    console.log('WebSocket connection closed');
    webSocket = null;
    deleteLoudmouthHTML(tab);
}

function deleteLoudmouthHTML(tab: chrome.tabs.Tab) {
    chrome.scripting.executeScript({
        func: () => {
            document.querySelector('.loudmouth')?.remove();
        },
        target: { tabId: tab.id || 0 }
    });
}

function disconnect() {
    if (webSocket) {
        webSocket.close();
    }
}

// Serves as connection checker and updates server on where they are in video
function keepAlive(tab: chrome.tabs.Tab) {
    const keepAliveIntervalId = setInterval(() => {
        if (webSocket) {
            console.log('ping');
            getCurrentTimeAndPing(tab);
        } else {
            clearInterval(keepAliveIntervalId);
        }
    }, 5000);
}

chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
    if (message.type === 'GET_CURRENT_TIME' && webSocket) {
        console.log("Current Time:", message.data.time_of_media);
        const ping_comment: OutgoingComment = {
            message: "PING_MESSAGE",
            poster: "PING_POSTER",
            time_of_media: message.data.time_of_media,
            media_id: "PING_TITLE"
        };
        webSocket.send(JSON.stringify(ping_comment));
    }
});

function getCurrentTimeAndPing(tab: chrome.tabs.Tab){
    chrome.scripting.executeScript({
        func: () => {
            const script = document.createElement('script');
            script.src = chrome.runtime.getURL('src/background/inject.js');
            document.documentElement.appendChild(script);

            window.addEventListener('message', (event) => {
                if (event.source !== window || event.data.type !== 'LOUDMOUTH_NETFLIX_TIME') return;
                const time_of_media = event.data.time;

                chrome.runtime.sendMessage({
                    type: 'GET_CURRENT_TIME',
                    data: {
                        time_of_media
                    }
                });
            }, { once: true });

            script.remove();
        },
        target: { tabId: tab.id || 0 }
    });
}