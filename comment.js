// ==================================================
// コメントの表示・投稿に関する処理
// ==================================================

// 投稿欄やコメント一覧など、画面にある部品を取得する。
const message = document.getElementById("message");
const chat = document.getElementById("chat");
const olderMessagesContainer = document.getElementById("chat-older-messages");
function updateOlderMessagesVisibility() {
    olderMessagesContainer.hidden = !window.isAdminMode();
}
updateOlderMessagesVisibility();
window.addEventListener("admin-mode-change", updateOlderMessagesVisibility);
window.addEventListener("storage", function (event) {
    if (event.key === "admin") {
        updateOlderMessagesVisibility();
    }
});
// ページを開き直したときにコメント欄の高さを保ち、画面がずれるのを防ぐ。
const reservedMessageLayoutHeightKey = "message-layout-reserved-height";
// 前回ページを離れるときに記録したコメント欄の高さを読み込む。
const reservedMessageLayoutHeight =
    sessionStorage.getItem(reservedMessageLayoutHeightKey);
// 前回の高さをページの見た目に反映し、読み込み中に欄の大きさが変わらないようにする。
if (reservedMessageLayoutHeight !== null) {
    document.documentElement.style.setProperty(
        "--message-layout-reserved-height",
        reservedMessageLayoutHeight
    );
}
// 高さが記録されているときだけ、その高さを使うための設定を有効にする。
if (reservedMessageLayoutHeight !== null) {
    document.body.classList.add("message-layout-size-reserved");
}
function saveMessageLayoutSize() {
    // コメント欄が見つからない場合や、コメントの読み込みが終わる前は記録しない。
    const messageSection = document.getElementById("message-section");
    if (messageSection && document.body.classList.contains("comments-ready")) {
        sessionStorage.setItem(
            reservedMessageLayoutHeightKey,
            messageSection.getBoundingClientRect().height + "px"
        );
    }
}
// ページを閉じる、または別のページへ移る直前に、現在のコメント欄の高さを記録する。
window.addEventListener("pagehide", saveMessageLayoutSize);

// --------------------------------------------------
// コメントを何件ずつ表示するかの設定
// --------------------------------------------------

// 最近のコメントは合計30行を目安に表示し、それより古いコメントは50件ずつまとめる。
const recentMessageLineLimit = 30;
const olderMessageChunkSize = 50;
// 古いコメントの日時などを調べるときは、通信回数を減らすため一度に最大1000件取得する。
const olderMessageFetchSize = 1000;

// 最近のコメントと、折りたたんで表示する古いコメントを別々に入れる場所を作る。
const recentMessagesContainer = document.createElement("div");

// 読み込みを始めるたびに番号を増やし、古い読み込み結果が後から表示されないようにする。
let messageLoadVersion = 0;
// 最近のコメントを表示する場所を、コメント欄の中に用意する。
chat.replaceChildren(recentMessagesContainer);

function formatMessageDate(row) {
    // 保存されている日時をこの端末の時刻に直し、数字をそろえて読みやすく表示する。
    const date = new Date(row.created_at);

    return (
        date.getFullYear() + "/" +
        String(date.getMonth() + 1).padStart(2, "0") + "/" +
        String(date.getDate()).padStart(2, "0") + " " +
        String(date.getHours()).padStart(2, "0") + ":" +
        String(date.getMinutes()).padStart(2, "0") + ":" +
        String(date.getSeconds()).padStart(2, "0")
    );
}

function createMessageElement(row) {
    // 1件のコメントから、本文と投稿日時を表示する画面の部品を作る。
    const messageElement = document.createElement("div");
    messageElement.className = "chat-message";

    const dateElement = document.createElement("span");
    dateElement.className = "chat-message-date";

    const contentElement = document.createElement("div");
    contentElement.className = "chat-message-content";
    // 古い形式のコメントにだけ付いている「英数字ID: 」を、画面には表示しない。
    const content = row.message.replace(
        /^([A-Za-z0-9]{8}|[A-Za-z0-9]{10}): /,
        ""
    );
    appendMessageContent(contentElement, content);
    if (row.is_admin) {
        // 管理者のコメントには、誰の投稿か分かる印を日時の前に付ける。
        const adminLabel = document.createElement("span");
        adminLabel.className = "chat-message-admin";
        adminLabel.textContent = "あ";
        dateElement.append(adminLabel, " ");
    }
    dateElement.append(formatMessageDate(row));

    messageElement.append(contentElement, dateElement);

    return messageElement;
}

// --------------------------------------------------
// コメントを読み込んで画面に表示する処理
// --------------------------------------------------

function countMessageLines(messageElement) {
    // 画面で折り返された行も含めて、このコメントが何行分を使うか数える。
    const content = messageElement.querySelector(".chat-message-content");
    const contentRange = document.createRange();
    contentRange.selectNodeContents(content);
    const contentRects = Array.from(contentRange.getClientRects())
        .filter(function (rect) {
            return rect.height > 0 && rect.width > 0;
        })
        .sort(function (first, second) {
            return first.top - second.top;
        });

    const contentLineTops = [];
    contentRects.forEach(function (rect) {
        // 文字ごとの位置を調べ、同じ高さにある文字は同じ行として数える。
        if (!contentLineTops.some(function (top) {
            return Math.abs(top - rect.top) < 1;
        })) {
            contentLineTops.push(rect.top);
        }
    });

    const date = messageElement.querySelector(".chat-message-date");
    const dateRange = document.createRange();
    dateRange.selectNodeContents(date);
    const dateRects = Array.from(dateRange.getClientRects())
        .filter(function (rect) {
            return rect.height > 0 && rect.width > 0;
        });
    const dateHasSeparateLine = dateRects.length > 0 && !dateRects.some(
        function (dateRect) {
            return contentRects.some(function (contentRect) {
                return (
                    dateRect.top < contentRect.bottom &&
                    dateRect.bottom > contentRect.top
                );
            });
        }
    );

    // 本文が空でも1行分とし、日時が本文と別の行にある場合はその行も数える。
    return Math.max(
        1,
        contentLineTops.length + (dateHasSeparateLine ? 1 : 0)
    );
}

function appendMessageContent(container, text) {
    // 投稿文をHTMLとして解釈せず、そのまま安全に表示する。http:// または https:// の文字だけはリンクにする。
    const urlPattern = /https?:\/\/[^\s<>"']+/gi;
    // URLの直後に句読点などが続いていたら、それらはリンクにせず文章側に残す。
    const trailingPunctuationPattern = /[.,!?;:)\]}、。，．！？；：」』】）]+$/;
    let currentIndex = 0;
    let match;

    while ((match = urlPattern.exec(text)) !== null) {
        const matchedUrl = match[0];
        const url = matchedUrl.replace(trailingPunctuationPattern, "");
        const punctuation = matchedUrl.slice(url.length);
        const startIndex = match.index;

        // 見つかったURLの前にある文章を、リンクにせずそのまま追加する。
        container.appendChild(
            document.createTextNode(text.slice(currentIndex, startIndex))
        );

        let parsedUrl;
        try {
            // 正しいURLとして読み取れない文字は、リンクにせず文章として表示する。
            parsedUrl = new URL(url);
        } catch {
            container.appendChild(document.createTextNode(url));
            if (punctuation) {
                container.appendChild(document.createTextNode(punctuation));
            }
            currentIndex = startIndex + matchedUrl.length;
            continue;
        }

        // リンク先は別のタブで開き、このページの表示や操作に影響しないようにする。
        const link = document.createElement("a");
        link.href = parsedUrl.href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = url;
        container.appendChild(link);

        if (punctuation) {
            container.appendChild(document.createTextNode(punctuation));
        }
        currentIndex = startIndex + matchedUrl.length;
    }

    // 最後に見つけたURLより後ろの文章も追加する。
    container.appendChild(document.createTextNode(text.slice(currentIndex)));
}

async function loadMessage() {
    // 読み込みごとに番号を付け、後から古い読み込みが終わっても結果を使わないようにする。
    const loadVersion = ++messageLoadVersion;
    // 初めて表示するときは、ページが短いだけで「一番下を見ている」と判断しない。
    const canRestoreToBottom =
        document.body.classList.contains("comments-ready");
    // コメントを画面の外で準備してからまとめて表示し、読み込み中のちらつきを防ぐ。
    const stagedRecentMessages = document.createElement("div");
    const stagedOlderMessages = document.createElement("div");
    stagedRecentMessages.style.position = "fixed";
    stagedRecentMessages.style.left = "-10000px";
    stagedRecentMessages.style.top = "0";
    stagedRecentMessages.style.width =
        recentMessagesContainer.getBoundingClientRect().width + "px";
    stagedRecentMessages.style.visibility = "hidden";
    document.body.appendChild(stagedRecentMessages);

    // 表示する行数、次に取得する位置、古いコメントに切り替える場所を記録する。
    let lineCount = 0;
    let cursorId = null;
    let splitMetadata = [];
    let hasMoreMessages = true;
    let restoreToBottom = false;

    try {
        // 最近のコメントが目安の行数に達するまで、新しいものから順番に取得する。
        while (hasMoreMessages && splitMetadata.length === 0) {
            let query = supabaseClient
                .from("message")
                .select("*")
                .order("id", { ascending: false })
                .limit(olderMessageChunkSize);
            if (cursorId !== null) {
                query = query.lt("id", cursorId);
            }

            const { data, error } = await query;
            if (error) {
                // 読み込みに失敗したときは、今画面に出ているコメントをそのまま残す。
                console.error(error);
                return;
            }

            hasMoreMessages = data.length === olderMessageChunkSize;
            if (data.length === 0) {
                break;
            }

            cursorId = data[data.length - 1].id;
            for (let index = 0; index < data.length; index += 1) {
                const row = data[index];
                const messageElement = createMessageElement(row);
                stagedRecentMessages.appendChild(messageElement);
                const messageLines = countMessageLines(messageElement);

                if (
                    lineCount + messageLines > recentMessageLineLimit &&
                    lineCount > 0
                ) {
                    // 目安の行数を超える場合、そのコメントから古いコメント側に分ける。
                    messageElement.remove();
                    splitMetadata = data.slice(index).map(function (entry) {
                        return { id: entry.id, created_at: entry.created_at };
                    });
                    break;
                }

                lineCount += messageLines;
            }
        }

        if (splitMetadata.length > 0) {
            // 最近のコメントより古いものは、まず本文を取らず、識別番号と日時だけ調べる。
            let metadataCursorId = cursorId;
            while (true) {
                const { data, error } = await supabaseClient
                    .from("message")
                    .select("id, created_at")
                    .lt("id", metadataCursorId)
                    .order("id", { ascending: false })
                    .limit(olderMessageFetchSize);

                if (error) {
                    console.error(error);
                    return;
                }

                splitMetadata.push(...data);
                if (data.length < olderMessageFetchSize) {
                    break;
                }
                metadataCursorId = data[data.length - 1].id;
            }

            for (
                let start = 0;
                start < splitMetadata.length;
                start += olderMessageChunkSize
            ) {
                // 古いコメントを50件ずつに分ける。本文はグループを開くまで読み込まない。
                createOlderMessageGroup(
                    splitMetadata.slice(start, start + olderMessageChunkSize),
                    stagedOlderMessages
                );
            }
        }

        if (loadVersion !== messageLoadVersion) {
            // この読み込みの後に新しい読み込みが始まっていたら、古い結果は表示しない。
            return;
        }

        // 読み込み前に一番下を見ていた場合だけ、更新後も一番下に合わせる。
        restoreToBottom = canRestoreToBottom &&
            window.scrollY + window.innerHeight >=
            document.documentElement.scrollHeight - 2;
        recentMessagesContainer.replaceChildren(
            ...stagedRecentMessages.childNodes
        );
        olderMessagesContainer.replaceChildren(
            ...stagedOlderMessages.childNodes
        );
    } finally {
        // 読み込みが成功しても失敗しても、画面外で使った仮の場所を片付ける。
        stagedRecentMessages.remove();
        if (loadVersion === messageLoadVersion) {
            // 最新の読み込みが終わったら仮の高さ設定を解除し、実際の高さを記録する。
            document.body.classList.add("comments-ready");
            document.documentElement.style.removeProperty(
                "--message-layout-reserved-height"
            );
            document.body.classList.remove("message-layout-size-reserved");
            saveMessageLayoutSize();
            if (restoreToBottom) {
                // 読み込み前に一番下を見ていたときだけ、画面を一番下へ戻す。
                window.scrollTo(
                    0,
                    document.documentElement.scrollHeight - window.innerHeight
                );
            }
        }
    }
}

// --------------------------------------------------
// 古いコメントをまとめて折りたたむ処理
// --------------------------------------------------

function createOlderMessageGroup(metadata, container = olderMessagesContainer) {
    // 古いコメントを、クリックして開けるひとまとまりとして作る。
    const olderMessageGroup = document.createElement("details");
    olderMessageGroup.className = "chat-message-group";
    const groupTitle = document.createElement("summary");
    const dateRange = document.createElement("span");
    const groupContent = document.createElement("div");
    dateRange.className = "chat-message-group-date";
    dateRange.textContent = formatMessageDate(metadata[0]) + " ～";
    groupContent.className = "chat-message-group-content";
    groupTitle.appendChild(dateRange);
    olderMessageGroup.append(groupTitle, groupContent);

    const group = {
        content: groupContent,
        metadata,
        messagesLoaded: false,
        loadingPromise: null
    };

    groupTitle.addEventListener("click", function (event) {
        // 開閉時にブラウザーが自動で画面を動かすのを止め、見出しの位置を保つ。
        event.preventDefault();
        const titleTop = groupTitle.getBoundingClientRect().top;
        olderMessageGroup.open = !olderMessageGroup.open;

        requestAnimationFrame(function () {
            const topDifference =
                groupTitle.getBoundingClientRect().top - titleTop;
            window.scrollBy(0, topDifference);
        });

        if (olderMessageGroup.open && !group.messagesLoaded) {
            // 初めて開いたときに、そのグループに含まれるコメント本文を取得する。
            ensureOlderMessageGroupLoaded(group);
        }
    });

    container.appendChild(olderMessageGroup);
}

async function ensureOlderMessageGroupLoaded(group) {
    // すでに本文を読み込んでいれば、もう一度読み込まず今ある内容を使う。
    if (group.messagesLoaded) {
        return;
    }
    if (!group.loadingPromise) {
        // 同じグループを続けて開いても、読み込みが重ならないよう進行中の処理を共有する。
        group.loadingPromise = loadOlderMessageGroup(
            group.content,
            group.metadata,
            function () {
                group.messagesLoaded = true;
            }
        ).finally(function () {
            group.loadingPromise = null;
        });
    }
    await group.loadingPromise;
}

async function loadOlderMessageGroup(content, metadata, setLoaded) {
    // このグループに入るコメントだけを、識別番号の範囲で絞って読み込む。
    content.replaceChildren();

    const { data, error } = await supabaseClient
        .from("message")
        .select("*")
        .lte("id", metadata[0].id)
        .gte("id", metadata[metadata.length - 1].id)
        .order("id", { ascending: false })
        .limit(olderMessageChunkSize);

    if (error) {
        // 読み込みに失敗した理由を、開発者が確認できる場所に記録する。
        console.error(error);
        return;
    }
    content.replaceChildren();
    // 取得した順番のままコメントを表示し、次に開いたときは再読み込みしないようにする。
    data.forEach(function (row) {
        content.appendChild(createMessageElement(row));
    });
    setLoaded(true);
}

// --------------------------------------------------
// コメントを投稿する処理と管理者モードの切り替え
// --------------------------------------------------

async function sendMessage() {
    // 入力欄の文章を取り出し、何も入力されていない場合は送信しない。
    const text = message.value;

    if (text === "") {
        return;
    }

    // 投稿した時点で管理者モードかどうかを、コメントと一緒に保存する。
    const isAdmin = window.isAdminMode();

    const { error } = await supabaseClient
        .from("message")
        .insert({
            message: text,
            is_admin: isAdmin
        });

    if (error) {
        // 保存できなかったときは入力欄を消さず、原因を開発者が確認できる場所に記録する。
        console.error(error);
        return;
    }
    message.value = "";
    // 投稿できたら入力欄を空にし、保存先から最新のコメント一覧を読み直す。
    loadMessage();
}

function handleAdminCommand() {
    const command = message.value.trim();
    const enableAdmin = command === "/admin";
    const disableAdmin = command === "/admin off";
    if (!enableAdmin && !disableAdmin) {
        return false;
    }

    // /admin または /admin off が入力されたら管理者モードを切り替え、その文字はコメントとして投稿しない。
    window.setAdminMode(enableAdmin);
    message.value = "";
    return true;
}

message.addEventListener("input", function () {
    // 貼り付けなどで改行が入っても、入力欄には残さない。
    if (!/[\r\n]/.test(message.value)) {
        return;
    }

    // 改行を消したあとも、カーソルや選択中の範囲が元の文章の位置に合うよう調整する。
    const start = message.selectionStart;
    const end = message.selectionEnd;
    const valueBeforeStart = message.value.slice(0, start);
    const valueBeforeEnd = message.value.slice(0, end);
    message.value = message.value.replace(/[\r\n]/g, "");
    message.setSelectionRange(
        valueBeforeStart.replace(/[\r\n]/g, "").length,
        valueBeforeEnd.replace(/[\r\n]/g, "").length
    );
});

message.addEventListener("keydown", function (event) {
    // 日本語入力の変換を確定するためのEnterではなく、送信のEnterだけを処理する。
    if (event.key !== "Enter" || event.isComposing) {
        return;
    }

    if (handleAdminCommand()) {
        event.preventDefault();
        return;
    }

    event.preventDefault();
    // Shift、Ctrl、Alt、Commandキーと一緒にEnterを押した場合は送信しない。
    // それ以外のEnterでは、入力欄に改行を入れずコメントを送信する。
    if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) {
        return;
    }
    sendMessage();
});

document.getElementById("send").addEventListener("click", function () {
    // 送信ボタンでも管理者切り替えの文字を先に確認し、該当しなければコメントを送信する。
    if (handleAdminCommand()) {
        return;
    }
    sendMessage();
});

// 新しいコメントが保存された知らせを受け取ったら、コメント一覧を読み直す。
supabaseClient
    .channel("message-changes")
    .on(
        "postgres_changes",
        {
            event: "INSERT",
            schema: "public",
            table: "message"
        },
        function () {
            loadMessage();
        }
    )
    .subscribe();

// ページを開いたときに保存先からコメントを読み込み、画面に表示する。
loadMessage().finally(function () {
    window.markPageSectionReady("comments");
});
