import torch
from torch import nn
from torchvision.models.video import r3d_18, R3D_18_Weights


class R3DAttentionMIL(nn.Module):
    def __init__(
        self, num_classes=4, hidden_dim=128, attention_dim=64,
        dropout=0.3, encoder_chunk_size=4, pretrained=False,
    ):
        super().__init__()
        if encoder_chunk_size < 1:
            raise ValueError("encoder_chunk_size en az 1 olmalı.")
        weights = R3D_18_Weights.KINETICS400_V1 if pretrained else None
        self.backbone = r3d_18(weights=weights)
        feature_dim = self.backbone.fc.in_features
        self.backbone.fc = nn.Identity()
        self.encoder_chunk_size = int(encoder_chunk_size)

        self.project = nn.Sequential(
            nn.LayerNorm(feature_dim),
            nn.Linear(feature_dim, hidden_dim),
            nn.ReLU(),
        )
        self.attention = nn.Sequential(
            nn.Linear(hidden_dim, attention_dim),
            nn.Tanh(),
            nn.Linear(attention_dim, 1),
        )
        self.classifier = nn.Sequential(
            nn.Dropout(dropout),
            nn.Linear(hidden_dim, num_classes),
        )
        self.set_stage("warmup")

    def set_stage(self, stage):
        if stage not in ("warmup", "finetune"):
            raise ValueError("Aşama warmup veya finetune olmalı.")

        self.backbone.requires_grad_(False)
        if stage == "finetune":
            self.backbone.layer4.requires_grad_(True)

        self.stage = stage
        self.backbone.eval()

    def train(self, mode=True):
        super().train(mode)
        self.backbone.eval()
        return self

    def encode_clips(self, clips):
        features = [
            self.backbone(chunk)
            for chunk in clips.split(self.encoder_chunk_size, dim=0)
        ]
        return torch.cat(features, dim=0)

    def classify_features(self, features, mask=None):
        h = self.project(features)
        scores = self.attention(h).squeeze(-1).float()

        if mask is not None:
            if mask.shape != scores.shape:
                raise ValueError("Maske boyutu [Video, Klip] olmalı.")
            mask = mask.to(device=scores.device, dtype=torch.bool)
            if not mask.any(dim=1).all().item():
                raise ValueError("Her videoda en az bir geçerli klip olmalı.")
            scores = scores.masked_fill(~mask, float("-inf"))

        attention = torch.softmax(scores, dim=1)
        pooled = (h.float() * attention.unsqueeze(-1)).sum(dim=1)
        logits = self.classifier(pooled)
        return logits, attention

    def forward(self, videos, mask=None):
        if videos.ndim != 6 or videos.shape[2] != 3:
            raise ValueError("Girdi [B, K, 3, T, H, W] biçiminde olmalı.")
        batch_size, clip_count = videos.shape[:2]
        if batch_size < 1 or clip_count < 1:
            raise ValueError("Video ve klip sayıları en az 1 olmalı.")

        clips = videos.reshape(-1, *videos.shape[2:])
        features = self.encode_clips(clips)
        features = features.reshape(batch_size, clip_count, -1)
        return self.classify_features(features, mask)
