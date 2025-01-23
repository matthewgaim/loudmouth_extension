let webSocket: WebSocket | null = null;
type IncomingComment = {
    comment_id: number,
    message: string,
    poster: string,
    time_of_media: number,
}

type OutgoingComment = {
    message: string,
    poster: string,
    time_of_media: number,
    media_id: string
}

chrome.action.onClicked.addListener(async (tab: chrome.tabs.Tab) => {
    if (webSocket) {
        disconnect();
        deleteLoudmouthHTML(tab);
    } else {
        connect(tab);
        keepAlive();
    }
});

chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
    _sender.url
    if (message.type === 'SEND_COMMENT' && webSocket) {
        webSocket.send(JSON.stringify(message.data));
    }
});

/** Get video ID from given URL (currently just from Netflix)
 ** Example Input: 'https://www.netflix.com/watch/80126677?trackId=250350385'
 ** Example Output: '80126677'
*/
function getMediaId(url: string) {
    const netflix = url.split("https://www.netflix.com/watch/")
    if (netflix.length > 1)
        return netflix[1].split("?")[0]
    return "TEMPORARY_MEDIA_ID" // this will be changed soon to return empty str if not on netflix
}

function connect(tab: chrome.tabs.Tab) {
    if (!tab.url) {
        alert("You're not on any tab");
        return;
    }
    const media_id = getMediaId(tab.url);
    webSocket = new WebSocket(`ws://localhost:8000/ws?media_id=${media_id}`);

    webSocket.onopen = () => {
        console.log('websocket connection opened');
        chrome.scripting.executeScript({
            args: [media_id],
            func: (media_id) => {
                const loudmouthSidebarHTML = `
                    <style>
                        .loudmouth {
                            background: #f5f5f5;
                            border-radius: 4px;
                            padding: 16px;
                            font-family: Arial, sans-serif;
                            color: #000;
                            max-width: 400px;
                            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                            position:absolute;
                        }

                        .loudmouth-comments {
                            margin-bottom: 16px;
                            max-height: 300px;
                            overflow-y: auto;
                        }

                        .comment-row {
                            padding: 8px 0;
                            border-bottom: 1px solid #e0e0e0;
                        }

                        .comment-content {
                            margin: 0;
                            font-size: 14px;
                            line-height: 1.4;
                        }

                        .comment-metadata {
                            color: #666;
                            font-size: 12px;
                            margin-top: 4px;
                        }

                        .comment-user {
                            color: #1a73e8;
                            font-weight: 500;
                        }

                        .loudmouth-form {
                            display: flex;
                            gap: 8px;
                        }

                        .loudmouth-input {
                            flex: 1;
                            background: #fff;
                            border: 1px solid #ccc;
                            border-radius: 4px;
                            padding: 8px 12px;
                            color: #000;
                            font-size: 14px;
                            transition: border-color 0.2s ease;
                        }

                        .loudmouth-input:focus {
                            outline: none;
                            border-color: #1a73e8;
                        }

                        .loudmouth-submit {
                            background: #1a73e8;
                            color: white;
                            border: none;
                            border-radius: 4px;
                            padding: 8px 16px;
                            font-size: 14px;
                            font-weight: 500;
                            cursor: pointer;
                            transition: background 0.2s ease;
                        }

                        .loudmouth-submit:hover {
                            background: #185abc;
                        }
                    </style>
                    <div class="loudmouth">
                        <div id="loudmouth_comments" class="loudmouth-comments"></div>
                        <form id="loudmouth_comment_form" class="loudmouth-form">
                            <input 
                                id="loudmouth_comment_input" 
                                class="loudmouth-input"
                                type="text" 
                                placeholder="Add a comment...">
                            <button
                                id="loudmouth_comment_form_submit_btn" 
                                class="loudmouth-submit" 
                                type="submit">
                                Post
                            </button>
                        </form>
                    </div>
                `;
                document.body.insertAdjacentHTML("beforeend", loudmouthSidebarHTML);

                document.getElementById('loudmouth_comment_form')?.addEventListener('submit', (e) => {
                    e.preventDefault();

                    const inputElement = document.getElementById('loudmouth_comment_input') as HTMLInputElement;
                    const commentText = inputElement.value;
                    
                    chrome.runtime.sendMessage({
                        type: 'SEND_COMMENT',
                        data: {
                            message: commentText,
                            poster: "Matthew",
                            time_of_media: 3,
                            media_id
                        }
                    });
                });
            },
            target: {
                tabId: tab.id || 0
            }
        });
    };

    webSocket.onmessage = (event) => {
        const message: IncomingComment = JSON.parse(event.data)
        chrome.scripting.executeScript({
            args: [message],
            func: (messageData) => {
                const div = document.createElement('div');
                div.className = 'comment-row';
                div.id = messageData.comment_id.toString();
                div.innerHTML = `
                    <p class="comment-content">
                        <span class="comment-user">${messageData.poster}</span>
                        ${messageData.message}
                    </p>
                    <div class="comment-metadata">
                        ${messageData.time_of_media}
                    </div>
                `;
                document.getElementById('loudmouth_comments')?.appendChild(div);
            },
            target: {
                tabId: tab.id || 0
            }
        });
    };

    webSocket.onclose = () => {
        console.log('websocket connection closed');
        webSocket = null;
        deleteLoudmouthHTML(tab);
    };
}

function deleteLoudmouthHTML(tab: chrome.tabs.Tab){
    chrome.scripting.executeScript({
        func: () => {
            document.getElementById('loudmouth')?.remove()
        },
        target: {
            tabId: tab.id || 0
        }
    });
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
            const comment: OutgoingComment = {
                message: "PING_MESSAGE",
                poster: "PING_POSTER",
                time_of_media: 1,
                media_id: "PING_TITLE"
            }
            webSocket.send(JSON.stringify(comment));
        } else {
            clearInterval(keepAliveIntervalId);
        }
    }, 5000);
}
