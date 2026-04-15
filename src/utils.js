export function getSerialNumber() {
    const serialNumber = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const length = 17

    let result = "";
    for (let i = 0; i < length; i++) {
        result += serialNumber.charAt(Math.floor(Math.random() * serialNumber.length));
    }
    return result;
}
