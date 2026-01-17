using Unity.Netcode;
using UnityEngine;

namespace KarmoMinigames
{
    public class NetworkManagerUI : MonoBehaviour
    {
        private void OnGUI()
        {
            GUILayout.BeginArea(new Rect(10, 10, 300, 300));
            if (!NetworkManager.Singleton.IsClient && !NetworkManager.Singleton.IsServer)
            {
                if (GUILayout.Button("Host (Server + Client)")) NetworkManager.Singleton.StartHost();
                if (GUILayout.Button("Client")) NetworkManager.Singleton.StartClient();
                if (GUILayout.Button("Server")) NetworkManager.Singleton.StartServer();
            }
            else
            {
                GUILayout.Label($"Mode: {(NetworkManager.Singleton.IsHost ? "Host" : NetworkManager.Singleton.IsServer ? "Server" : "Client")}");
                if (GUILayout.Button("Shutdown")) NetworkManager.Singleton.Shutdown();
            }
            GUILayout.EndArea();
        }
    }
}
