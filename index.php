<html>
    <head>
        <title>Panel Estrellas</title>
    </head>
    <body>
        <?php echo "date: ". date('Y-m-d H:i:s'); ?>

    <h1>Paint IRL server</h1>

    <div id="players">

    </div>


    </body>
</html>


<script type="text/javascript">
    var HOST = location.origin.replace(/^http/, 'ws');
    var ws = new WebSocket(HOST);

    let logInData = {
        action: "login",
        nickname: "Panel Web",
        role: "panel"
    };

</script>
