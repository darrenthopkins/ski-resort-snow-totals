import {
  IonContent,
  IonHeader,
  IonPage,
  IonTitle,
  IonToolbar,
  IonText,
  IonList,
  IonItem,
  IonLabel,
  IonNote,
} from "@ionic/react";
import "./Tab2.css";

const Tab2: React.FC = () => {
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Favorites</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent fullscreen className="ion-padding">
        <IonHeader collapse="condense">
          <IonToolbar>
            <IonTitle size="large">Favorites</IonTitle>
          </IonToolbar>
        </IonHeader>

        <IonText>
          <h2>Coming soon</h2>
          <p>
            Pin your favorite resorts to keep them at the top of your week plan.
          </p>
        </IonText>

        <IonList inset>
          <IonItem>
            <IonLabel>
              <h3>⭐ Save resorts</h3>
              <p>Keep a short-list for quick planning.</p>
            </IonLabel>
          </IonItem>

          <IonItem>
            <IonLabel>
              <h3>📍 Distance-aware</h3>
              <p>Favorites will respect your drive radius settings.</p>
            </IonLabel>
          </IonItem>

          <IonItem>
            <IonLabel>
              <h3>🔔 Smart alerts</h3>
              <p>Get a heads-up when your favorites pop for a storm window.</p>
            </IonLabel>
          </IonItem>
        </IonList>

        <IonNote style={{ display: "block", marginTop: "1rem", opacity: 0.7 }}>
          Tip: For now, use the Snow tab to pick the best day — Favorites will
          make it faster.
        </IonNote>
      </IonContent>
    </IonPage>
  );
};

export default Tab2;
