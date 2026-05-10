window.addEventListener("load", () => {
  const { createApp } = Vue;

  createApp({
    data() {
      return {
        cameras: [],
        currentDeviceId: null,
        scanning: false,
        scanStatus: "Câmera parada",
        codeReader: null,
        highlightBarcode: false,
        torchDisponivel: false,
        torchAtivo: false,
        zoomDisponivel: false,
        zoomMin: 1,
        zoomMax: 5,
        zoomStep: 0.1,
        zoomAtual: 1,
        _videoTrack: null,
        form: {
          barcode: "",
          name: "",
          weight: "",
          package: "",
          photo: null,
        },
        produtos: [],
        busca: "",
        edicao: null,
      };
    },

    computed: {
      produtosFiltrados() {
        if (!this.busca.trim()) return this.produtos;
        const q = this.busca.toLowerCase();
        return this.produtos.filter((p) => p.name.toLowerCase().includes(q));
      },
    },

    async mounted() {
      await this.initDevices();
      await this.carregarProdutos();
    },

    methods: {
      async initDevices() {
        if (!navigator.mediaDevices?.enumerateDevices) {
          this.scanStatus = "API de câmera não suportada neste navegador.";
          return;
        }
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter((d) => d.kind === "videoinput");
        this.cameras = videoDevices.map((d, i) => ({
          deviceId: d.deviceId,
          label: d.label || `Câmera ${i + 1}`,
        }));
        if (this.cameras.length > 0) {
          this.currentDeviceId = this.cameras[0].deviceId;
        }
      },

      onCameraChange(e) {
        this.currentDeviceId = e.target.value;
        if (this.scanning) {
          this.stopScanner();
          this.startScanner();
        }
      },

      toggleScan() {
        if (this.scanning) {
          this.stopScanner();
        } else {
          this.startScanner();
        }
      },

      // Helper: escaneia o ImageData de um canvas usando zbar-wasm. Retorna o texto do código ou null.
      async scanearCanvas(canvas) {
        if (typeof zbarWasm === "undefined") return null;
        const ctx = canvas.getContext("2d");
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const symbols = await zbarWasm.scanImageData(imageData);
        if (symbols && symbols.length > 0) {
          return symbols[0].decode();
        }
        return null;
      },

      async startScanner() {
        const constraints = {
          video: {
            ...(this.currentDeviceId
              ? { deviceId: { exact: this.currentDeviceId } }
              : { facingMode: { ideal: "environment" } }),
            width:  { ideal: 1920, min: 1280 },
            height: { ideal: 1080, min: 720 },
            focusMode: "continuous",
          },
        };
        this.scanStatus = "Iniciando câmera...";

        try {
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          const video = document.getElementById("video");
          video.srcObject = stream;
          video.setAttribute("playsinline", "true");
          await video.play();

          this.scanning = true;
          this._scanStream = stream;
          this._videoTrack = stream.getVideoTracks()[0];

          const caps = this._videoTrack.getCapabilities?.();
          this.torchDisponivel = !!(caps && caps.torch);
          if (caps && caps.zoom) {
            this.zoomDisponivel = true;
            this.zoomMin = caps.zoom.min ?? 1;
            this.zoomMax = caps.zoom.max ?? 5;
            this.zoomStep = caps.zoom.step ?? 0.1;
            const zoomInicial = Math.min(2, this.zoomMax);
            this.zoomAtual = zoomInicial;
            this._videoTrack.applyConstraints({ advanced: [{ zoom: zoomInicial }] }).catch(() => {});
          }

          this.scanStatus = "Procurando código...";

          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");

          const tentarFrame = async () => {
            if (!this.scanning) return;

            const w = video.videoWidth;
            const h = video.videoHeight;
            if (!w || !h) {
              this._scanTimer = setTimeout(tentarFrame, 150);
              return;
            }

            // Recorta região central (80% largura × 40% altura)
            const cropW = Math.round(w * 0.8);
            const cropH = Math.round(h * 0.4);
            const cropX = Math.round((w - cropW) / 2);
            const cropY = Math.round((h - cropH) / 2);

            canvas.width = cropW;
            canvas.height = cropH;
            ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

            try {
              const codigo = await this.scanearCanvas(canvas);
              if (codigo) {
                this.scanStatus = `Código detectado: ${codigo}`;
                this.stopScanner();
                const existente = await db.buscarPorCodigo(codigo);
                if (existente) {
                  this.abrirEdicao(existente);
                } else {
                  this.form.barcode = codigo;
                  this.triggerHighlight();
                }
                return;
              }
            } catch { /* segue tentando */ }

            this._scanTimer = setTimeout(tentarFrame, 200);
          };

          setTimeout(tentarFrame, 500);
          await this.initDevices();
        } catch (error) {
          this.scanStatus = `Não foi possível acessar a câmera: ${error.name || error.message || error}`;
          this.scanning = false;
        }
      },

      stopScanner() {
        if (this._scanTimer) {
          clearTimeout(this._scanTimer);
          this._scanTimer = null;
        }
        if (this.torchAtivo && this._videoTrack) {
          this._videoTrack.applyConstraints({ advanced: [{ torch: false }] }).catch(() => {});
          this.torchAtivo = false;
        }
        if (this._scanStream) {
          this._scanStream.getTracks().forEach((t) => t.stop());
          this._scanStream = null;
        }
        const video = document.getElementById("video");
        if (video) video.srcObject = null;
        this.scanning = false;
        this.scanStatus = "Câmera parada";
        this.torchDisponivel = false;
        this.zoomDisponivel = false;
        this.zoomAtual = 1;
        this._videoTrack = null;
      },

      async aplicarZoom(e) {
        this.zoomAtual = parseFloat(e.target.value);
        if (!this._videoTrack) return;
        try {
          await this._videoTrack.applyConstraints({ advanced: [{ zoom: this.zoomAtual }] });
        } catch { /* dispositivo não suportou */ }
      },

      async toggleTorch() {
        if (!this._videoTrack) return;
        this.torchAtivo = !this.torchAtivo;
        try {
          await this._videoTrack.applyConstraints({ advanced: [{ torch: this.torchAtivo }] });
        } catch {
          this.torchAtivo = false;
        }
      },

      async lerCodigoDeImagem(e) {
        const file = e.target.files[0];
        e.target.value = "";
        if (!file) return;

        this.scanStatus = "Processando imagem...";

        try {
          let bitmap;
          try {
            bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
          } catch {
            bitmap = await createImageBitmap(file);
          }

          // Reduz para no máximo 1280px
          const MAX = 1280;
          const ratio = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
          const w = Math.round(bitmap.width * ratio);
          const h = Math.round(bitmap.height * ratio);

          const canvasBase = document.createElement("canvas");
          canvasBase.width = w;
          canvasBase.height = h;
          canvasBase.getContext("2d").drawImage(bitmap, 0, 0, w, h);

          // zbar lida bem com rotações nativamente, mas mantemos fallback
          let codigo = await this.scanearCanvas(canvasBase);
          if (!codigo) {
            for (const graus of [90, 180, 270]) {
              const girado = graus === 90 || graus === 270;
              const cnv = document.createElement("canvas");
              cnv.width  = girado ? h : w;
              cnv.height = girado ? w : h;
              const ctx = cnv.getContext("2d");
              ctx.translate(cnv.width / 2, cnv.height / 2);
              ctx.rotate((graus * Math.PI) / 180);
              ctx.drawImage(canvasBase, -w / 2, -h / 2);
              codigo = await this.scanearCanvas(cnv);
              if (codigo) break;
            }
          }

          if (codigo) {
            this.scanStatus = `Código detectado: ${codigo}`;
            const existente = await db.buscarPorCodigo(codigo);
            if (existente) {
              this.abrirEdicao(existente);
            } else {
              this.form.barcode = codigo;
              this.triggerHighlight();
            }
          } else {
            this.scanStatus = "Câmera parada";
            alert("Não foi possível encontrar um código de barras nessa imagem.");
          }
        } catch (err) {
          this.scanStatus = "Câmera parada";
          alert(`Erro ao processar a imagem: ${err.message || err}`);
        }
      },

      triggerHighlight() {
        this.highlightBarcode = false;
        this.$nextTick(() => {
          this.highlightBarcode = true;
          setTimeout(() => { this.highlightBarcode = false; }, 600);
        });
      },

      onPhotoChange(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => { this.form.photo = ev.target.result; };
        reader.readAsDataURL(file);
      },

      async carregarProdutos() {
        this.produtos = await db.listarProdutos();
      },

      async submitForm() {
        await db.salvarProduto({
          barcode: this.form.barcode,
          name: this.form.name,
          weight: this.form.weight,
          package: this.form.package,
          quantity: 1,
          photo: this.form.photo,
        });
        this.form = { barcode: "", name: "", weight: "", package: "", photo: null };
        await this.carregarProdutos();
      },

      async removerProduto(id) {
        if (!confirm("Remover este produto da despensa?")) return;
        await db.removerProduto(id);
        await this.carregarProdutos();
      },

      async ajustarQuantidade(produto, delta) {
        const novaQty = Math.max(0, (produto.quantity || 0) + delta);
        await db.atualizarProduto({ ...produto, quantity: novaQty });
        await this.carregarProdutos();
      },

      abrirEdicao(produto) {
        this.edicao = { ...produto };
      },

      fecharEdicao() {
        this.edicao = null;
      },

      async salvarEdicao() {
        await db.atualizarProduto(this.edicao);
        this.edicao = null;
        await this.carregarProdutos();
      },
    },
  }).mount("#app");
});
