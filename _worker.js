export default {
    async fetch(request, env, ctx) {
        try {
            let { host, pathname, search } = new URL(request.url);

            if (pathname === "/put" && search.startsWith("?value=")) { // api创建短网址，自行修改pathname
                let value = atob(search.substring(7));

                // 判断链接是否网址，且长度少于2048个字符
                if (is_url(value) && value.length < 2048) {
                    // 生成短码
                    let key = await md5_encode(value);

                    // d1数据库操作：插入并更新url_list
                    await env.shorturl_d1.prepare("REPLACE INTO url_list(key, value) VALUES (?, ?)")
                        .bind(key, value)
                        .run();

                    return Response.json({
                        "msg": "put ok",
                        "data": key,
                    });
                }
            } else if (pathname === "/del" && search.startsWith("?key=")) { // api删除短网址，自行修改pathname
                let key = search.substring(5);

                // d1数据库操作：删除url_list
                await env.shorturl_d1.prepare("DELETE FROM url_list WHERE key = ?")
                    .bind(key)
                    .run();

                return Response.json({
                    "msg": "del ok",
                    "data": key,
                });
            } else if (pathname !== "/" && pathname.length > 6) { // 查询短网址并跳转           
                let key = pathname.substring(1);

                // d1数据库操作：查询url_list
                let value = await env.shorturl_d1.prepare("SELECT value FROM url_list WHERE key = ?")
                    .bind(key)
                    .first("value");

                // 判断链接是否网址，302跳转
                if (is_url(value)) {
                    return Response.redirect(value, 302);
                }
            } else if (pathname === "/") { // 主页展示
                let now_time = new Date().getTime();
                let longurl = "";
                let shorturl = "";

                // 表单POST提交处理
                if (request.method === "POST") {
                    let req = await request.formData();
                    let old_token = req.get("token");
                    longurl = req.get("longurl");

                    // 判断链接是否网址，且长度少于2048个字符
                    if (is_url(longurl) && longurl.length < 2048) {
                        // d1数据库操作：查询token_list
                        let token = await env.shorturl_d1.prepare("SELECT token FROM token_list WHERE token = ?")
                            .bind(old_token)
                            .first("token");

                        // 判断是否存在token鉴权，如果存在则插入数据
                        if (token !== null) {
                            // 生成短码
                            let key = await md5_encode(longurl);

                            // d1数据库操作：插入并更新url_list
                            await env.shorturl_d1.prepare("REPLACE INTO url_list(key, value) VALUES (?, ?)")
                                .bind(key, longurl)
                                .run();

                            shorturl = "https://" + host + "/" + key;
                        }
                    } else {
                        shorturl = "THE LINK IS ERROR!";
                    }

                    // d1数据库操作：删除旧的token
                    await env.shorturl_d1.prepare("DELETE FROM token_list WHERE token = ? OR time < ?")
                        .bind(old_token, now_time)
                        .run();
                }

                // 生成新的token用于表单提交鉴权
                let new_token = Math.random().toString(36).substring(2);
                // 设置新的token过期时间1天
                let expire_time = now_time + 86400000;

                // d1数据库操作：插入新的token
                await env.shorturl_d1.prepare("INSERT INTO token_list(token, time) VALUES (?, ?)")
                    .bind(new_token, expire_time)
                    .run();

                // 返回默认页面
                return new Response(home_page(new_token, longurl, shorturl), {
                    status: 200,
                    headers: {
                        "content-type": "text/html",
                    },
                });
            }
        } catch (e) {
        }

        // 返回错误页面
        return new Response("Url Not Found", {
            status: 404,
        });
    },
};

async function md5_encode(value) {
    // md5加密
    let msgUint8 = new TextEncoder().encode(value); // encode as (utf-8) Uint8Array
    let hashBuffer = await crypto.subtle.digest("MD5", msgUint8); // hash the message
    let hashArray = Array.from(new Uint8Array(hashBuffer)); // convert buffer to byte array
    // let hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join(""); // convert bytes to hex string

    // 10进制转62进制
    // abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789
    // 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz
    let base = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnopqrstuvwxyz"; // 可打乱字母顺序
    let arr = [];
    for (let i = 0; i < hashArray.length; i += 2) {
        let j = hashArray[i] + hashArray[i + 1];
        arr.push(base[j % base.length]);
    }
    let hashHex = arr.reverse().join("");

    // 根据网址长度决定短码的长度，可自行修改
    let key = "";
    if (value.length > 128) {
        key = hashHex.substring(0, 8);
    } else if (value.length > 64) {
        key = hashHex.substring(0, 7);
    } else {
        key = hashHex.substring(0, 6);
    }

    return key;
}

function is_url(value) {
    return value.toLocaleLowerCase().startsWith("http://") || value.toLocaleLowerCase().startsWith("https://");
}

function home_page(token, longurl = "", shorturl = "") {
    let html = `
<!DOCTYPE html>
<html>

<head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <title>URL SHORTENER</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            background: #1e128d;
            font-size: 14px;
        }

        .main {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #355ac0;
            color: white;
            width: 300px;
            padding: 40px;
            text-align: center;
            border-radius: 10px;
            box-shadow: 0 50px 50px rgba(0, 0, 0, 0.5);
        }

        .main h1 {
            font-size: 2.4em;
        }

        .main a {
            color: white;
        }

        .longurl {
            border: 0;
            background: none;
            display: block;
            margin: 20px auto;
            text-align: center;
            border: 2px solid #3498db;
            padding: 14px 10px;
            outline: none;
            color: white;
            font-size: 1.4em;
            border-radius: 25px;
        }

        .shorten {
            border: 0;
            background: none;
            display: block;
            margin: 20px auto;
            text-align: center;
            border: 2px solid #3498db;
            padding: 14px 25px;
            outline: none;
            color: white;
            border-radius: 25px;
            cursor: pointer;
        }

        .shorten:hover {
            background: #3498db;
        }

        .shorturl {
            border: 0;
            background: none;
            display: block;
            margin: 10px auto 50px auto;
            width: 100%;
            text-align: center;
            outline: none;
            color: white;
            font-size: 1em;
        }
    </style>
</head>

<body>
    <div class="main">
        <form method="post" action="/">
            <h1>URL SHORTENER</h1>
            <p>FREE LINK, NO ADS, NO LIMITS</p>
            <input type="text" name="longurl" value="` + longurl + `" class="longurl" placeholder="ENTER THE LINK HERE">
            <input type="hidden" name="token" value="` + token + `">
            <button type="submit" class="shorten">SHORTEN</button>
        </form>
        <input type="text" value="` + shorturl + `" class="shorturl" readonly="readonly" onclick="this.select()">
        <p>
          <a href="https://github.com/openlablog" target="_blank">© OPENLABLOG</a>
        </p>
    </div>

    <script>
        // 阻止重新提交刷新和后退按钮
        if (window.history.replaceState) {
            window.history.replaceState(null, null, location.href);
        }
    </script>
</body>

</html>
  `;
    return html;
}
