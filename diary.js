// 日記の表示や投稿を行う。ページによっては日記用の部品がないため、使う前に確認する。

// 新しい日記を書くための入力欄やボタン。管理者モードで追加操作をしたときに画面へ表示する。
const diaryBody = document.createElement("textarea");
const diaryConfirmButton = document.createElement("button");
const diaryEditorStatus = document.createElement("span");
const diaryTitleInput = document.createElement("input");
diaryTitleInput.id = "diary-title";
diaryTitleInput.type = "text";
diaryTitleInput.setAttribute("aria-label", "日記の日付");
diaryBody.id = "diary-body";
diaryBody.rows = 1;
diaryBody.addEventListener("input", resizeDiaryBody);
diaryBody.setAttribute("aria-label", "日記本文");
diaryConfirmButton.id = "diary-confirm";
diaryConfirmButton.type = "button";
diaryConfirmButton.textContent = "確定";
diaryEditorStatus.id = "diary-editor-status";
diaryEditorStatus.setAttribute("aria-live", "polite");
// 保存処理が進んでいる間、同じ日記を重ねて保存しないための印。
let diarySaving = false;
// 新しい日記の入力欄を開いている間だけ true になる。
let diaryEditing = false;
const diaryAddButton = document.getElementById("diary-add");
// index.html に用意されている日記表示欄と移動ボタンを取得する。
const diaryList = document.getElementById("diary-list");
const diaryEntryNavigation = document.querySelector(".diary-entry-navigation");
// 前の日記・次の日記へ移動するボタン。
const diaryNavigationButtons = document.querySelectorAll(
    "#diary-view [data-diary-direction]"
);
// 保存先から読み込んだ日記。新しい日記から順に並ぶ。
let diaryEntries = [];
// 一度作った日記の表示部品を覚えておく。まだ作っていないものは null。
let diaryArticles = [];
// 今表示している日記が、並び順の何番目にあるか。
let selectedDiaryIndex = 0;
// 画面に表示する画像の大きさと、JPEGとして保存するときの画質。
const diaryImageWidth = 360;
const diaryImageHeight = 270;
const diaryImageQuality = 0.75;

// 日記のタイトル（例: 2026/10/05 12:00:00）から、画像名に使う日付（例: 261005）を取り出す。
// タイトルの先頭が日付でなければ null を返す。その場合、この日記には画像を表示しない。
function getDiaryImageDate(title) {
    // タイトルに「|」があれば、その前の部分を日付として調べる。
    const dateTitle = title.split("|", 1)[0];
    const match = dateTitle.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
    if (!match) {
        return null;
    }

    const [, year, month, day] = match;
    return year.slice(-2) + month.padStart(2, "0") + day.padStart(2, "0");
}

// images/YYMMDD-NN.jpg という名前の画像を読み込み、画面用に小さくした画像を返す。
// 指定した番号の画像がなければ null を返す（次の画像がないという意味）。
// 小さくする処理に失敗した場合は、失敗したことを呼び出し元に伝える。
function loadDiaryImage(date, sequence) {
    return new Promise(function (resolve, reject) {
        const image = document.createElement("img");
        // ファイル名の番号は01、02のように2桁にする。
        const fileNumber = String(sequence).padStart(2, "0");

        image.alt = "";
        // 画像をすぐ読み込む。画面に表示する前に小さくする必要があるため。
        image.loading = "eager";
        // 元画像が読み込めたら、小さい画像を作り、その画像も準備できてから返す。
        image.addEventListener("load", function handleSourceLoad() {
            image.removeEventListener("load", handleSourceLoad);
            try {
                const canvas = document.createElement("canvas");
                canvas.width = diaryImageWidth;
                canvas.height = diaryImageHeight;
                const context = canvas.getContext("2d");
                if (!context) {
                    throw new Error("Canvas 2D context is unavailable.");
                }

                // 画像全体を指定した大きさに合わせる。
                context.drawImage(
                    image,
                    0,
                    0,
                    diaryImageWidth,
                    diaryImageHeight
                );
                const resizedImage = document.createElement("img");
                resizedImage.alt = "";
                resizedImage.loading = "eager";
                resizedImage.addEventListener("load", function () {
                    resolve(resizedImage);
                }, { once: true });
                resizedImage.addEventListener("error", function () {
                    reject(new Error("縮小後の日記画像を読み込めませんでした。"));
                }, { once: true });
                resizedImage.src = canvas.toDataURL(
                    "image/jpeg",
                    diaryImageQuality
                );
            } catch (error) {
                reject(error);
            }
        });
        // 画像が見つからなければ、これより後の番号の画像も探さない。
        image.addEventListener("error", function () {
            resolve(null);
        }, { once: true });
        image.src = `images/${date}-${fileNumber}.jpg`;
    });
}

// 日付に合う画像を01、02…の順に探し、見つかった画像から順に表示する。
async function appendDiaryImages(article, title) {
    // タイトルから日付を取り出せない場合は、画像を探さない。
    const date = getDiaryImageDate(title);
    if (!date) {
        return;
    }

    const imageList = document.createElement("div");
    imageList.className = "diary-entry-image-grid";
    const imageFrame = document.createElement("div");
    imageFrame.className = "diary-entry-images";
    imageFrame.appendChild(imageList);
    for (let sequence = 1; sequence <= 99; sequence += 1) {
        let image;
        try {
            image = await loadDiaryImage(date, sequence);
        } catch (error) {
            console.error("日記画像を縮小・圧縮できませんでした。", error);
            return;
        }
        if (!image) {
            return;
        }

        imageList.appendChild(image);
        // 最初の画像が用意できたら枠ごと表示し、残りの画像は準備できるたびに追加する。
        if (!imageFrame.isConnected) {
            article.appendChild(imageFrame);
        }
    }
}

// 管理者モードが有効かを調べる。設定はこのブラウザーに保存され、comment.js からも使われる。
window.isAdminMode = function () {
    return localStorage.getItem("admin") === "true";
};

// 管理者モードの設定を保存し、画面のほかの処理にも切り替わったことを知らせる。
window.setAdminMode = function (enabled) {
    if (enabled) {
        localStorage.setItem("admin", "true");
    } else {
        localStorage.removeItem("admin");
    }
    window.dispatchEvent(new Event("admin-mode-change"));
};

// 入力した文章がすべて見えるように、日記の入力欄の高さを調整する。
function resizeDiaryBody() {
    diaryBody.style.height = "auto";
    diaryBody.style.height = diaryBody.scrollHeight + "px";
}

// 新しい日記の入力欄を、最新の日記の表示場所に出したり、元の表示に戻したりする。
function updateDiaryEditor() {
    const article = diaryList && diaryList.firstElementChild;
    if (!article) {
        return;
    }
    const content = article.querySelector(".diary-entry-content");
    const header = article.querySelector(".diary-entry-header");
    const dateLabel = article.querySelector(".diary-entry-date");
    const images = article.querySelector(".diary-entry-images");
    if (window.isAdminMode() && diaryEditing && selectedDiaryIndex === 0) {
        if (content.dataset.text === undefined) {
            content.dataset.text = content.textContent;
        }
        if (diaryTitleInput.value === "") {
            diaryTitleInput.value = formatDiaryTitleDate(new Date());
        }
        content.replaceChildren(diaryBody);
        resizeDiaryBody();
        if (images) {
            images.hidden = true;
        }
        dateLabel.hidden = true;
        header.prepend(diaryEditorStatus);
        header.append(diaryTitleInput);
    } else if (content.dataset.text !== undefined) {
        content.textContent = content.dataset.text;
        delete content.dataset.text;
        if (images) {
            images.hidden = false;
        }
        dateLabel.hidden = false;
        diaryEditorStatus.remove();
        diaryTitleInput.remove();
    }
}

// 日記の入力中だけ、確定ボタンを日記移動ボタンの行に表示する。
function updateDiaryConfirmButton() {
    if (window.isAdminMode() && diaryEditing) {
        diaryEntryNavigation.append(diaryConfirmButton);
    } else {
        diaryConfirmButton.remove();
    }
}

// 追加ボタンは、管理者モードで最新の日記を見ており、入力欄を開いていないときだけ表示する。
function updateDiaryAddButton() {
    if (diaryAddButton) {
        diaryAddButton.hidden =
            !window.isAdminMode() || diaryEditing || selectedDiaryIndex !== 0;
    }
}

// 管理者モードや入力状態に合わせて、日記の入力欄と関連ボタンの表示を更新する。
function updateDiaryAdminUi() {
    if (!window.isAdminMode()) {
        diaryEditing = false;
    }
    updateDiaryEditor();
    updateDiaryConfirmButton();
    updateDiaryAddButton();
    updateDiaryNavigationButtons();
}

// 日記の本文とタイトルを保存する。入力欄が空の場合や、すでに保存中の場合は何もしない。
async function submitDiary() {
    const content = diaryBody.value.trim();
    const title = diaryTitleInput.value.trim();
    if (diarySaving || !window.isAdminMode() || content === "" || title === "") {
        return;
    }

    diarySaving = true;
    diaryConfirmButton.disabled = true;
    const { error } = await supabaseClient
        .from("diary")
        .insert({ title, content });
    diarySaving = false;
    diaryConfirmButton.disabled = false;

    // 保存に失敗した場合は入力内容を残し、もう一度試せるようにする。
    if (error) {
        console.error(error);
        return;
    }

    diaryBody.value = "";
    resizeDiaryBody();
    diaryTitleInput.value = "";
    diaryEditing = false;
    await loadDiaries();
    diaryEditorStatus.textContent = "";
}

diaryConfirmButton.addEventListener("click", submitDiary);
if (diaryAddButton) {
    diaryAddButton.addEventListener("click", function () {
        diaryEditing = true;
        diaryTitleInput.value = formatDiaryTitleDate(new Date());
        diaryEditorStatus.textContent = "";
        updateDiaryAdminUi();
        diaryBody.focus();
    });
}
updateDiaryAdminUi();
window.addEventListener("admin-mode-change", updateDiaryAdminUi);
window.addEventListener("storage", function (event) {
    if (event.key === "admin") {
        updateDiaryAdminUi();
    }
});
// 日付を「2026/10/05 12:00:00」の形式の文字列にする。
function formatDiaryTitleDate(date) {
    return (
        date.getFullYear() + "/" +
        String(date.getMonth() + 1).padStart(2, "0") + "/" +
        String(date.getDate()).padStart(2, "0") +
        " " +
        String(date.getHours()).padStart(2, "0") + ":" +
        String(date.getMinutes()).padStart(2, "0") + ":" +
        String(date.getSeconds()).padStart(2, "0")
    );
}

// 日記1件を表示する部品を作る。日付、本文、画像を入れる場所を用意する。
function createDiaryEntry(entry) {
    const article = document.createElement("article");
    article.className = "diary-entry";
    // タイトルに「|」があれば、その前の部分だけを日付として表示する。
    const date = entry.title.split("|", 1)[0];
    const header = document.createElement("div");
    header.className = "diary-entry-header";
    const entryDate = document.createElement("span");
    entryDate.className = "diary-entry-date";
    entryDate.textContent = date;
    header.appendChild(entryDate);
    const content = document.createElement("div");
    content.className = "diary-entry-content";
    // 本文をHTMLとして扱わず、入力された文字のまま表示する。
    content.textContent = entry.content;
    article.append(header, content);
    return article;
}

// 前後の日記へ移動するボタンの表示を更新する。日記を入力中なら「前」は最新の日記へ移動する。
function updateDiaryNavigationButtons() {
    const index = diaryEditing ? -1 : selectedDiaryIndex;
    diaryNavigationButtons.forEach(function (button) {
        const direction = button.dataset.diaryDirection;
        const destinationIndex = direction === "previous" ? index + 1 : index - 1;
        const hasDestination = destinationIndex >= 0 &&
            destinationIndex < diaryEntries.length;
        const title = hasDestination
            ? diaryEntries[destinationIndex].title.split("|", 1)[0]
            : "";
        button.hidden = !hasDestination;
        button.textContent = direction === "previous"
            ? `◂ ${title}`
            : `${title} ▸`;
    });
}

// 指定された順番の日記を表示し、前後の移動ボタンも更新する。
function renderDiarySelection(index) {
    // 指定された番号が日記の範囲外、または整数でなければ何もしない。
    if (!Number.isInteger(index) || index < 0 || index >= diaryEntries.length) {
        return;
    }

    // 別の日記へ移るときは入力欄を閉じ、表示を日記本文に戻す。
    if (diaryEditing) {
        diaryEditing = false;
        updateDiaryEditor();
        updateDiaryConfirmButton();
    }
    selectedDiaryIndex = index;
    // 画像の読み込みを待たず、日付と本文を先に表示する。
    if (!diaryArticles[index]) {
        const entry = diaryEntries[index];
        diaryArticles[index] = createDiaryEntry(entry);
        appendDiaryImages(diaryArticles[index], entry.title).catch(function (error) {
            console.error("日記画像を読み込めませんでした。", error);
        });
    }

    // 日記は新しい順に並んでいるため、「前」はひとつ古い日記、「次」はひとつ新しい日記。
    // 移動先がなければボタンを隠し、ある場合はその日付をボタンに表示する。
    updateDiaryNavigationButtons();
    diaryList.replaceChildren(diaryArticles[index]);
    updateDiaryAdminUi();
}

// 日記がない場合や読み込みに失敗した場合、前後の日記へ移動するボタンを隠す。
function hideDiaryNavigation() {
    diaryNavigationButtons.forEach(function (button) {
        button.closest(".diary-entry-navigation").hidden = true;
    });
}

// 保存先から日記を新しい順に読み込み、最新の日記を表示する。
async function loadDiaries() {
    // このページに日記の表示場所がなければ、読み込みを行わない。
    if (!diaryList) {
        return;
    }

    const { data, error } = await supabaseClient
        .from("diary")
        .select("title, content")
        .order("id", { ascending: false });

    if (error) {
        console.error(error);
        hideDiaryNavigation();
        return;
    }
    diaryEntries = data;
    // 日記ごとの表示部品を覚えておく場所を用意する。まだ作っていない部品は null にする。
    diaryArticles = data.map(function () {
        return null;
    });

    // 日記があれば最新のものを表示する。日記がなければ移動ボタンを隠す。
    if (diaryEntries.length > 0) {
        renderDiarySelection(0);
        diaryEntryNavigation.hidden = false;
    } else {
        hideDiaryNavigation();
    }
}

// 前後のボタンが押されたら、表示する日記をひとつ古い、または新しいものへ切り替える。
diaryNavigationButtons.forEach(function (button) {
    button.addEventListener("click", function () {
        const indexOffset = button.dataset.diaryDirection === "previous" ? 1 : -1;
        // 入力中に「前」を押した場合は、最新の日記へ移動する。
        const baseIndex = diaryEditing ? -1 : selectedDiaryIndex;
        renderDiarySelection(baseIndex + indexOffset);
    });
});

// ページを開いたときに日記を読み込んで表示する。
loadDiaries().finally(function () {
    window.markPageSectionReady("diary");
});
