(function () {
    "use strict";

    // All portfolio copy and image URLs live in data.json.
    var dataURL = new URL("data.json", document.baseURI);
    var portfolio = document.getElementById("portfolio");
    var loadState = document.getElementById("load-state");
    var diagnostics = document.getElementById("load-error");
    var localFile = document.getElementById("local-data");

    function valueAt(data, path) {
        return path.split(".").reduce(function (value, key) {
            return value == null ? undefined : value[key];
        }, data);
    }

    function requireText(data, path) {
        if (typeof valueAt(data, path) !== "string") {
            throw new TypeError("data.json: " + path + " must be a string.");
        }
    }

    function validate(data) {
        ["site.title", "site.language", "site.description",
         "header.brand", "header.brandAccent", "header.status",
         "introduction.label", "introduction.title", "introduction.titleAccent",
         "introduction.description", "introduction.img", "introduction.imgAlt",
         "introduction.imgPlaceholder", "activities.label", "activities.title",
         "activities.description", "footer.text", "footer.highlight"
        ].forEach(function (path) { requireText(data, path); });

        if (!Array.isArray(data.activities.items)) {
            throw new TypeError("data.json: activities.items must be an array.");
        }
        // Optional academic-term grouping; legacy JSON without terms still renders.
        if (data.activities.terms !== undefined) {
            if (!Array.isArray(data.activities.terms) || data.activities.terms.length === 0) {
                throw new TypeError("data.json: activities.terms must be a nonempty array.");
            }
            var knownTerms = Object.create(null);
            data.activities.terms.forEach(function (term, index) {
                ["id", "title", "description"].forEach(function (field) {
                    if (typeof term[field] !== "string" || !term[field].trim()) {
                        throw new TypeError("data.json: activities.terms." + index + "." + field + " must be a nonempty string.");
                    }
                });
                if (knownTerms[term.id]) {
                    throw new TypeError("data.json: duplicate academic term " + term.id);
                }
                knownTerms[term.id] = true;
            });
            data.activities.items.forEach(function (item, index) {
                if (!knownTerms[item.term]) {
                    throw new TypeError("data.json: activities.items." + index + ".term has no matching academic period.");
                }
            });
        }
        data.activities.items.forEach(function (item, index) {
            ["number", "title", "description", "img", "imgAlt", "imgPlaceholder"]
                .forEach(function (field) {
                    requireText(data, "activities.items." + index + "." + field);
                });
            // A gallery is optional, so existing single-image activities stay compatible.
            if (item.images !== undefined) {
                if (!Array.isArray(item.images) || item.images.length === 0 ||
                    !item.images.every(function (path) { return typeof path === "string" && !!path.trim(); })) {
                    throw new TypeError("data.json: activities.items." + index + ".images must be a nonempty array of image paths.");
                }
            }
        });

        // Older JSON files can omit these sections without hiding the portfolio.
        if (data.profile != null) {
            ["label", "nameLabel", "name", "badge"].forEach(function (field) {
                requireText(data, "profile." + field);
            });
            if (!Array.isArray(data.profile.details)) {
                throw new TypeError("data.json: profile.details must be an array.");
            }
            data.profile.details.forEach(function (detail, index) {
                requireText(data, "profile.details." + index + ".label");
                requireText(data, "profile.details." + index + ".value");
            });
        }
        if (data.instructor != null) {
            ["label", "name", "course", "img", "imgAlt", "imgPlaceholder"]
                .forEach(function (field) { requireText(data, "instructor." + field); });
        }
    }

    function bindText(root, data) {
        root.querySelectorAll("[data-text]").forEach(function (element) {
            // Text is inserted safely, never interpreted as HTML.
            var value = valueAt(data, element.dataset.text);
            element.textContent = value == null ? "" : value;
        });
    }

    function setImage(holder, item, eager) {
        var placeholder = holder.querySelector("[data-placeholder]");
        placeholder.textContent = item.imgPlaceholder;
        placeholder.hidden = false;
        var previous = holder.querySelector("img");
        if (previous) { previous.remove(); }
        if (!item.img.trim()) { return; }

        var source;
        try {
            source = new URL(item.img.trim(), document.baseURI);
            if (!["http:", "https:", "file:"].includes(source.protocol)) { return; }
        } catch (error) { return; }

        var img = document.createElement("img");
        img.alt = item.imgAlt;
        img.loading = eager ? "eager" : "lazy";
        img.decoding = "async";
        // A lazy image must have a layout box to start loading off-screen.
        // The placeholder remains underneath until the image loads.
        img.className = "content-image is-loading";
        img.addEventListener("load", function () {
            img.classList.remove("is-loading");
            placeholder.hidden = true;
        });
        img.addEventListener("error", function () {
            img.remove();
            placeholder.hidden = false;
        });
        holder.appendChild(img);
        img.src = source.href;
    }

    // Load the isolated carousel styles without changing the existing website CSS.
    var galleryStyles = document.createElement("link");
    galleryStyles.rel = "stylesheet";
    galleryStyles.href = new URL("activity-gallery.css", document.baseURI).href;
    document.head.appendChild(galleryStyles);

    // Only multi-image activities receive arrows; old cards retain their layout.
    function setActivityImage(card, item) {
        var holder = card.querySelector(".activity-image");
        if (!Array.isArray(item.images) || item.images.length < 2) {
            setImage(holder, item, false);
            return;
        }

        var frame = card.querySelector(".activity-frame");
        var current = 0;
        frame.classList.add("has-gallery");

        var nav = document.createElement("div");
        nav.className = "exam-gallery-nav";
        var previous = document.createElement("button");
        previous.type = "button";
        previous.className = "exam-gallery-arrow";
        previous.textContent = "\u2039";
        previous.setAttribute("aria-label", "Previous exam page");
        var next = document.createElement("button");
        next.type = "button";
        next.className = "exam-gallery-arrow";
        next.textContent = "\u203A";
        next.setAttribute("aria-label", "Next exam page");
        nav.appendChild(previous);
        nav.appendChild(next);
        frame.appendChild(nav);

        var counter = document.createElement("span");
        counter.className = "exam-gallery-counter";
        counter.setAttribute("role", "status");
        counter.setAttribute("aria-live", "polite");
        frame.appendChild(counter);

        function showPage() {
            setImage(holder, {
                img: item.images[current],
                imgAlt: item.title + ", page " + (current + 1) + " of " + item.images.length,
                imgPlaceholder: item.imgPlaceholder
            }, false);
            counter.textContent = String(current + 1).padStart(2, "0") + " / " +
                String(item.images.length).padStart(2, "0");
        }

        previous.addEventListener("click", function () {
            current = (current + item.images.length - 1) % item.images.length;
            showPage();
        });
        next.addEventListener("click", function () {
            current = (current + 1) % item.images.length;
            showPage();
        });
        showPage();
    }

    function renderAcademicContext(data) {
        var profileCard = document.getElementById("profile-card");
        var instructorCard = document.getElementById("instructor-card");
        var context = document.getElementById("academic-context");
        var details = document.getElementById("profile-details");
        profileCard.hidden = data.profile == null;
        instructorCard.hidden = data.instructor == null;
        context.hidden = profileCard.hidden && instructorCard.hidden;
        context.classList.toggle("has-one-card", profileCard.hidden !== instructorCard.hidden);
        details.textContent = "";

        if (data.profile != null) {
            data.profile.details.forEach(function (detail) {
                var row = document.createElement("div");
                row.className = "detail-row";
                var label = document.createElement("dt");
                var value = document.createElement("dd");
                label.textContent = detail.label;
                value.textContent = detail.value;
                row.appendChild(label);
                row.appendChild(value);
                details.appendChild(row);
            });
        }
        if (data.instructor != null) {
            setImage(document.getElementById("instructor-image"), data.instructor, false);
        }
    }

    function render(data) {
        validate(data);
        var fragment = document.createDocumentFragment();
        var template = document.getElementById("activity-template");

        function makeCard(item) {
            var card = template.content.firstElementChild.cloneNode(true);
            card.dataset.number = item.number;
            bindText(card, item);
            if (item.pendingImage === true) {
                card.classList.add("is-pending-asset");
            }
            if (item.textOnly === true) {
                // Explicit no-photo activities remain compact text-only cards.
                card.classList.add("is-text-only");
                card.querySelector(".activity-frame").remove();
            } else {
                setActivityImage(card, item);
            }
            return card;
        }

        if (Array.isArray(data.activities.terms) && data.activities.terms.length) {
            // Keep the original first heading from index.html unchanged.
            // Add only matching headings and card wrappers for subsequent terms.
            data.activities.terms.forEach(function (term, index) {
                if (index > 0) {
                    var heading = document.createElement("div");
                    heading.className = "activities-heading term-heading reveal";
                    var eyebrow = document.createElement("div");
                    eyebrow.className = "activities-label";
                    eyebrow.textContent = data.activities.label;
                    var title = document.createElement("h2");
                    title.className = "activities-title";
                    title.textContent = term.title;
                    var description = document.createElement("p");
                    description.className = "activities-description";
                    description.textContent = term.description;
                    heading.appendChild(eyebrow);
                    heading.appendChild(title);
                    heading.appendChild(description);
                    fragment.appendChild(heading);
                }
                var group = document.createElement("div");
                group.className = "term-cards";
                data.activities.items.forEach(function (item) {
                    if (item.term === term.id) {
                        group.appendChild(makeCard(item));
                    }
                });
                fragment.appendChild(group);
            });
        } else {
            // Backward-compatible flat list for older data.json files.
            data.activities.items.forEach(function (item) {
                fragment.appendChild(makeCard(item));
            });
        }

        bindText(portfolio, data);
        document.title = data.site.title;
        document.documentElement.lang = data.site.language;
        document.querySelector('meta[name="description"]').content = data.site.description;
        setImage(document.getElementById("introduction-image"), data.introduction, true);
        renderAcademicContext(data);
        var section = document.getElementById("activities-section");
        section.querySelectorAll(".term-cards, .term-heading, .activity-card").forEach(function (node) { node.remove(); });
        section.appendChild(fragment);
        portfolio.hidden = false;
        loadState.hidden = true;
        document.body.setAttribute("aria-busy", "false");
        startMotion();
    }

    function showError(error) {
        loadState.classList.add("load-failed");
        loadState.querySelector("progress").hidden = true;
        diagnostics.hidden = false;
        // Bootstrap diagnostics are runtime errors, not portfolio content.
        // They must remain available even if data.json is missing or invalid.
        diagnostics.textContent = error.name + ": " + error.message;
        var link = document.getElementById("data-link");
        link.href = dataURL.href;
        link.textContent = dataURL.pathname.split("/").pop();
        link.hidden = false;
        if (window.location.protocol === "file:") { localFile.hidden = false; }
        document.body.setAttribute("aria-busy", "false");
        console.error(error);
    }

    // Local double-click previews can select the same data.json manually.
    // GitHub Pages reads it automatically through fetch below.
    localFile.addEventListener("change", function () {
        var file = localFile.files[0];
        if (!file) { return; }
        file.text().then(function (text) {
            render(JSON.parse(text));
        }).catch(showError);
    });

    function startMotion() {
        var motion = window.matchMedia("(prefers-reduced-motion: reduce)");
        var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
        var elements = portfolio.querySelectorAll(".reveal");
        var cards = portfolio.querySelectorAll(".activity-card");
        var observer = null;

        function revealAll() {
            elements.forEach(function (element) { element.classList.remove("is-pending"); });
            if (observer) { observer.disconnect(); }
        }

        if (!motion.matches && "IntersectionObserver" in window) {
            try {
                observer = new IntersectionObserver(function (entries) {
                    entries.forEach(function (entry) {
                        if (entry.isIntersecting) {
                            entry.target.classList.remove("is-pending");
                            observer.unobserve(entry.target);
                        }
                    });
                }, { threshold: 0, rootMargin: "0px 0px 30px 0px" });
                elements.forEach(function (element) {
                    if (element.getBoundingClientRect().top > window.innerHeight) {
                        element.classList.add("is-pending");
                        observer.observe(element);
                    }
                });
            } catch (error) { revealAll(); }
        }

        function resetCard(card) {
            card.style.removeProperty("--tilt-x");
            card.style.removeProperty("--tilt-y");
        }
        cards.forEach(function (card) {
            card.addEventListener("mousemove", function (event) {
                if (motion.matches || !finePointer.matches || window.innerWidth <= 1000) {
                    resetCard(card);
                    return;
                }
                var rect = card.getBoundingClientRect();
                var x = (event.clientX - rect.left) / rect.width - .5;
                var y = (event.clientY - rect.top) / rect.height - .5;
                card.style.setProperty("--tilt-x", (-y * 3).toFixed(2) + "deg");
                card.style.setProperty("--tilt-y", (x * 3).toFixed(2) + "deg");
            }, { passive: true });
            card.addEventListener("mouseleave", function () { resetCard(card); });
        });

        function updateMotionPreference() {
            if (motion.matches) { revealAll(); }
            cards.forEach(resetCard);
        }
        if (motion.addEventListener) { motion.addEventListener("change", updateMotionPreference); }
        else if (motion.addListener) { motion.addListener(updateMotionPreference); }
    }

    function updateVisibility() {
        document.documentElement.classList.toggle("page-paused", document.hidden);
    }
    document.addEventListener("visibilitychange", updateVisibility);
    updateVisibility();

    fetch(dataURL.href, { cache: "no-store" }).then(function (response) {
        if (!response.ok) { throw new Error("data.json: HTTP " + response.status); }
        return response.json();
    }).then(render).catch(showError);
}());
