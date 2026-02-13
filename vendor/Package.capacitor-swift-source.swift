// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "capacitor-swift-source",
    platforms: [.iOS(.v15)],
    products: [
        .library(name: "Capacitor", targets: ["Capacitor"]),
        .library(name: "Cordova", targets: ["CapacitorCordova"]),
    ],
    targets: [
        .target(
            name: "Capacitor",
            path: "../capacitor/ios/Capacitor/Capacitor"
        ),
        .target(
            name: "CapacitorCordova",
            dependencies: ["Capacitor"],
            path: "../capacitor/ios/CapacitorCordova/CapacitorCordova"
        ),
    ]
)

