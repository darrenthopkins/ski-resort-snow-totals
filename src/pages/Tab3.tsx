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
} from "@ionic/react";
import "./Tab3.css";

const WORKER_URL = "https://sweet-waterfall-ccaa.darrenthopkins.workers.dev";

const GIT_SHA = import.meta.env.VITE_GIT_SHA ?? "dev";

const Tab3: React.FC = () => {
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>About</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent fullscreen className="ion-padding">
        <IonHeader collapse="condense">
          <IonToolbar>
            <IonTitle size="large">About</IonTitle>
          </IonToolbar>
        </IonHeader>

        <IonText>
          <h2>Lift</h2>
          <p>
            Lift helps identify the best ski days based on recent snowfall,
            forecasted snow, and drive distance — giving you a simple,
            data-driven way to plan your week.
          </p>
        </IonText>

        <IonList inset>
          <IonItem>
            <IonLabel>
              <h3>Data Sources</h3>
              <p>OnTheSnow (snow reports)</p>
              <p>NWS / NOAA (forecast data)</p>
              <p>Cloudflare Worker proxy layer</p>
            </IonLabel>
          </IonItem>

          <IonItem>
            <IonLabel>
              <h3>Feedback</h3>
              <p>
                Found a bug or have an idea? Please reply directly in TestFlight
                or reach out with suggestions.
              </p>
            </IonLabel>
          </IonItem>
        </IonList>

        <div
          style={{
            marginTop: "3rem",
            fontSize: "0.75rem",
            opacity: 0.6,
          }}
        >
          <p>Build: 1.0</p>
          <p>Commit: {GIT_SHA}</p>
          <p>Proxy: {WORKER_URL}</p>
          <p>Environment: Production</p>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default Tab3;
